/**
 * Tech-Econ Resource Submission Worker
 * Receives form submissions and commits them to the GitHub repository
 */

const ALLOWED_ORIGINS = [
  'https://tech-econ.com',
  'https://www.tech-econ.com',
  'https://rawatpranjal.github.io',
  'http://localhost:1313'
];

// Resource type to JSON file mapping
const RESOURCE_MAP = {
  'package': { file: 'packages.json', nameField: 'name' },
  'dataset': { file: 'datasets.json', nameField: 'name' },
  'learning': { file: 'resources.json', nameField: 'name' },
  'paper': { file: 'papers.json', nameField: 'title' },
  'talk': { file: 'talks.json', nameField: 'name' },
  'book': { file: 'books.json', nameField: 'name' },
  'community': { file: 'community.json', nameField: 'name' }
};

// Rate limiting
const RATE_LIMIT = {
  MAX_SUBMISSIONS_PER_HOUR: 5,
  MAX_NAME_LENGTH: 200,
  MAX_DESCRIPTION_LENGTH: 1000
};

// In-memory rate limit store (resets on worker restart)
const rateLimitStore = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }

    try {
      // POST /submit - Main submission endpoint
      if (request.method === 'POST' && url.pathname === '/submit') {
        return handleSubmit(request, env, ctx, origin);
      }

      // GET /health - Health check
      if (request.method === 'GET' && url.pathname === '/health') {
        return jsonResponse({
          status: 'ok',
          hasGitHubToken: !!env.GITHUB_TOKEN,
          timestamp: Date.now()
        }, origin);
      }

      // GET /categories - Return valid categories
      if (request.method === 'GET' && url.pathname === '/categories') {
        return jsonResponse(getCategories(), origin);
      }

      return new Response('Not found', { status: 404 });
    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse({ success: false, error: err.message }, origin, 500);
    }
  }
};

// ============================================
// POST /submit - Handle resource submission
// ============================================

async function handleSubmit(request, env, ctx, origin) {
  if (!isAllowedOrigin(origin)) {
    return jsonResponse({ success: false, error: 'Forbidden' }, origin, 403);
  }

  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  try {
    // Rate limiting
    if (isRateLimited(clientIP)) {
      return jsonResponse({
        success: false,
        error: 'Too many submissions. Please try again later.'
      }, origin, 429);
    }

    // Parse form data
    const contentType = request.headers.get('Content-Type') || '';
    let formData;

    if (contentType.includes('application/json')) {
      formData = await request.json();
    } else if (contentType.includes('form-data') || contentType.includes('urlencoded')) {
      const fd = await request.formData();
      formData = Object.fromEntries(fd.entries());
    } else {
      return jsonResponse({ success: false, error: 'Invalid content type' }, origin, 400);
    }

    // Validate input
    const validation = validateSubmission(formData);
    if (!validation.valid) {
      return jsonResponse({ success: false, errors: validation.errors }, origin, 400);
    }

    // Check GitHub token
    if (!env.GITHUB_TOKEN) {
      return jsonResponse({
        success: false,
        error: 'GitHub integration not configured'
      }, origin, 500);
    }

    // Get resource config
    const resourceType = formData.resource_type;
    const config = RESOURCE_MAP[resourceType];
    if (!config) {
      return jsonResponse({
        success: false,
        error: `Unknown resource type: ${resourceType}`
      }, origin, 400);
    }

    // Map form data to schema
    const entry = mapToSchema(formData, resourceType);

    // Append to JSON file
    const result = await appendToJsonFile(env, config.file, entry, config.nameField);

    if (!result.success) {
      return jsonResponse({
        success: false,
        error: result.error
      }, origin, result.status || 500);
    }

    // Track successful submission for rate limiting
    trackSubmission(clientIP);

    return jsonResponse({
      success: true,
      message: `${entry[config.nameField]} submitted successfully!`,
      file: config.file
    }, origin);

  } catch (err) {
    console.error('Submit error:', err);
    return jsonResponse({
      success: false,
      error: 'Submission failed. Please try again.'
    }, origin, 500);
  }
}

// ============================================
// Validation
// ============================================

function validateSubmission(data) {
  const errors = [];

  // Required fields
  if (!data.resource_type) {
    errors.push('Resource type is required');
  } else if (!RESOURCE_MAP[data.resource_type]) {
    errors.push(`Invalid resource type: ${data.resource_type}`);
  }

  if (!data.resource_name || data.resource_name.trim().length < 2) {
    errors.push('Resource name is required (min 2 characters)');
  }

  if (!data.url) {
    errors.push('URL is required');
  } else if (!isValidUrl(data.url)) {
    errors.push('Invalid URL format');
  }

  // Length limits
  if (data.resource_name && data.resource_name.length > RATE_LIMIT.MAX_NAME_LENGTH) {
    errors.push(`Name too long (max ${RATE_LIMIT.MAX_NAME_LENGTH} characters)`);
  }

  if (data.description && data.description.length > RATE_LIMIT.MAX_DESCRIPTION_LENGTH) {
    errors.push(`Description too long (max ${RATE_LIMIT.MAX_DESCRIPTION_LENGTH} characters)`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// ============================================
// Schema Mapping
// ============================================

function mapToSchema(formData, resourceType) {
  const name = formData.resource_name.trim();
  const description = (formData.description || '').trim();
  const category = (formData.category || 'Uncategorized').trim();
  const url = formData.url.trim();

  const base = {
    description,
    category,
    url,
    tags: [],
    _submitted: new Date().toISOString(),
    _submitter_email: formData.email || null
  };

  switch (resourceType) {
    case 'package':
      return {
        name,
        ...base,
        language: 'Python',
        docs_url: null,
        github_url: url.includes('github.com') ? url : null,
        install: '',
        best_for: ''
      };

    case 'dataset':
      return {
        name,
        ...base,
        docs_url: null,
        github_url: url.includes('github.com') ? url : null
      };

    case 'learning':
      return {
        name,
        ...base,
        type: 'Article',
        domain: extractDomain(url),
        level: 'Medium'
      };

    case 'paper':
      return {
        title: name,
        authors: '',
        year: new Date().getFullYear(),
        url,
        tags: [],
        citations: 0,
        tag: 'Community',
        description,
        category,
        _submitted: base._submitted,
        _submitter_email: base._submitter_email
      };

    case 'talk':
      return {
        name,
        ...base,
        type: 'Video',
        image_url: ''
      };

    case 'book':
      return {
        name,
        author: '',
        year: new Date().getFullYear(),
        ...base,
        type: 'Book',
        isbn: ''
      };

    case 'community':
      return {
        name,
        ...base,
        type: 'Event',
        location: '',
        dates: '',
        start_date: null,
        end_date: null,
        attendees: '',
        best_for: '',
        subcategory: ''
      };

    default:
      return { name, ...base };
  }
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return '';
  }
}

// ============================================
// GitHub API Integration
// ============================================

async function appendToJsonFile(env, filename, entry, nameField) {
  const owner = env.REPO_OWNER;
  const repo = env.REPO_NAME;
  const branch = env.BRANCH;
  const path = `data/${filename}`;

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

  try {
    // 1. GET current file content
    const getResponse = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'tech-econ-submit-worker'
      }
    });

    if (!getResponse.ok) {
      const errorData = await getResponse.json();
      console.error('GitHub GET error:', errorData);
      return {
        success: false,
        error: 'Failed to read current data',
        status: getResponse.status
      };
    }

    const fileData = await getResponse.json();

    // Decode base64 content
    const currentContentRaw = atob(fileData.content.replace(/\n/g, ''));
    let currentContent;

    try {
      currentContent = JSON.parse(currentContentRaw);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr);
      return {
        success: false,
        error: 'Failed to parse current data',
        status: 500
      };
    }

    // 2. Check for duplicates (by URL)
    const existingUrls = new Set();
    if (Array.isArray(currentContent)) {
      currentContent.forEach(item => {
        if (item.url) existingUrls.add(item.url.toLowerCase());
      });
    }

    if (existingUrls.has(entry.url.toLowerCase())) {
      return {
        success: false,
        error: 'This URL has already been submitted',
        status: 409
      };
    }

    // 3. Append new entry
    if (Array.isArray(currentContent)) {
      currentContent.push(entry);
    } else {
      // Handle nested structures (like papers.json)
      return {
        success: false,
        error: 'Complex file structure - manual review required',
        status: 400
      };
    }

    // 4. Commit updated content
    const newContent = JSON.stringify(currentContent, null, 2);
    const encodedContent = btoa(unescape(encodeURIComponent(newContent)));

    const entryName = entry[nameField] || entry.name || entry.title || 'Unknown';
    const commitMessage = `Add ${entryName} to ${filename} (via submit form)`;

    const putResponse = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'tech-econ-submit-worker',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: commitMessage,
        content: encodedContent,
        sha: fileData.sha,
        branch: branch
      })
    });

    if (!putResponse.ok) {
      const errorData = await putResponse.json();
      console.error('GitHub PUT error:', errorData);
      return {
        success: false,
        error: 'Failed to save submission',
        status: putResponse.status
      };
    }

    return { success: true };

  } catch (err) {
    console.error('GitHub API error:', err);
    return {
      success: false,
      error: 'GitHub API error',
      status: 500
    };
  }
}

// ============================================
// Rate Limiting (in-memory)
// ============================================

function isRateLimited(ip) {
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;

  // Clean old entries
  for (const [key, timestamps] of rateLimitStore.entries()) {
    const recent = timestamps.filter(ts => ts > hourAgo);
    if (recent.length === 0) {
      rateLimitStore.delete(key);
    } else {
      rateLimitStore.set(key, recent);
    }
  }

  // Hash IP for privacy
  const ipHash = hashIP(ip);
  const submissions = rateLimitStore.get(ipHash) || [];
  const recentSubmissions = submissions.filter(ts => ts > hourAgo);

  return recentSubmissions.length >= RATE_LIMIT.MAX_SUBMISSIONS_PER_HOUR;
}

function trackSubmission(ip) {
  const ipHash = hashIP(ip);
  const submissions = rateLimitStore.get(ipHash) || [];
  submissions.push(Date.now());
  rateLimitStore.set(ipHash, submissions);
}

function hashIP(ip) {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = ((hash << 5) - hash) + ip.charCodeAt(i);
    hash = hash & hash;
  }
  return hash.toString(36);
}

// ============================================
// Categories
// ============================================

function getCategories() {
  return {
    package: [
      'Adaptive Experimentation & Bandits',
      'Bayesian Methods',
      'Causal Inference & ML',
      'Matching & Stratification',
      'Platform & Marketplace',
      'Regression & Inference',
      'Statistical Computing',
      'Survival Analysis',
      'Time Series'
    ],
    dataset: [
      'Adaptive Experimentation & Bandits',
      'Bayesian Methods',
      'Causal Inference & ML',
      'Econometrics',
      'Platform & Marketplace'
    ],
    learning: [
      'AB Testing',
      'Bayesian Methods',
      'Causal Inference & ML',
      'Data Science',
      'Decision Science',
      'Econometrics',
      'Machine Learning',
      'Platform Economics',
      'Statistics'
    ],
    paper: [
      'Causal Inference',
      'Econometrics',
      'Machine Learning',
      'Platform Economics',
      'Statistics'
    ],
    talk: [
      'Data Science',
      'Econometrics',
      'Machine Learning',
      'Statistics'
    ],
    book: [
      'Causal Inference',
      'Econometrics',
      'Machine Learning',
      'Statistics'
    ],
    community: [
      'Conferences',
      'Meetups',
      'Workshops'
    ]
  };
}

// ============================================
// CORS & Response Helpers
// ============================================

function isAllowedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed));
}

function handleCORS(request) {
  const origin = request.headers.get('Origin');
  if (!isAllowedOrigin(origin)) {
    return new Response('Forbidden', { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Credentials': 'false'
  };
}

function jsonResponse(data, origin, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin || '*')
    }
  });
}
