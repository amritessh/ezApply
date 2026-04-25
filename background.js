chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GENERATE_COVER_LETTER') {
    generateCoverLetter(msg.payload).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (msg.type === 'TAILOR_ANSWERS') {
    tailorAnswers(msg.payload).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
  if (msg.type === 'TAILOR_RESUME') {
    tailorResume(msg.payload).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get('settings', data => resolve(data.settings || {}));
  });
}

// Unified LLM caller — routes to Anthropic or OpenAI-compatible endpoint
async function callLLM(prompt, settings) {
  const { provider = 'anthropic', apiKey = '', model = '', baseUrl = '' } = settings;

  if (!apiKey && provider !== 'ollama') {
    throw new Error('No API key set. Add it in Settings.');
  }

  if (provider === 'anthropic') {
    return callAnthropic(prompt, apiKey, model || 'claude-haiku-4-5-20251001');
  }

  // All others use OpenAI-compatible /v1/chat/completions
  const base = resolveBaseUrl(provider, baseUrl);
  return callOpenAICompatible(prompt, apiKey, model || defaultModel(provider), base);
}

function resolveBaseUrl(provider, customBaseUrl) {
  const urls = {
    openai: 'https://api.openai.com/v1',
    groq:   'https://api.groq.com/openai/v1',
    ollama: 'http://localhost:11434/v1',
    custom: customBaseUrl,
  };
  return urls[provider] || customBaseUrl;
}

function defaultModel(provider) {
  const models = {
    openai: 'gpt-4o-mini',
    groq:   'llama-3.3-70b-versatile',
    ollama: 'llama3',
  };
  return models[provider] || '';
}

async function callAnthropic(prompt, apiKey, model) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] })
  });
  if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content[0].text;
}

async function callOpenAICompatible(prompt, apiKey, model, baseUrl) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] })
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function generateCoverLetter({ profile, jobTitle, company, jobDescription, tone = 'Professional' }) {
  const settings = await getSettings();

  const toneGuide = {
    Professional:   'Formal, polished, structured. Standard business letter tone.',
    Conversational: 'Warm and human. Write like you\'re talking to a person, not a committee.',
    Confident:      'Direct and assertive. Lead with impact. No hedging language.',
    Concise:        'Brevity is key. Every sentence must earn its place. Max 150 words total.',
  }[tone] || 'Professional';

  const prompt = `Write a cover letter for ${profile.fullName || profile.firstName} applying for ${jobTitle} at ${company}.

Tone: ${tone} — ${toneGuide}

Resume: ${profile.resumeText?.slice(0, 1500) || 'Not provided'}

Job description: ${jobDescription?.slice(0, 1200) || 'Not provided'}

Instructions:
- 3 short paragraphs
- Open with a specific hook tied to the company or role, not "I am applying for..."
- Middle paragraph: match 2-3 concrete skills/experiences from the resume to specific job requirements
- Close with a confident call to action
- No filler phrases ("I am a passionate...", "I would be a great fit...")
- Output only the letter body, no subject line or sign-off boilerplate`;

  const text = await callLLM(prompt, settings);
  return { text };
}

async function tailorAnswers({ profile, question, jobTitle, company }) {
  const settings = await getSettings();

  const prompt = `Answer this job application question for ${profile.fullName || profile.firstName} applying for ${jobTitle} at ${company}.

Question: "${question}"

Their background: ${profile.resumeText?.slice(0, 1000) || 'Not provided'}

Write a concise, specific answer (2-4 sentences max). Be direct, no fluff.`;

  const text = await callLLM(prompt, settings);
  return { text };
}

async function tailorResume({ profile, jobDescription }) {
  const settings = await getSettings();

  const prompt = `You are a resume coach. Rewrite the candidate's resume bullet points to be highly relevant to the job description below.

Candidate's current resume:
${profile.resumeText?.slice(0, 2000) || 'Not provided'}

Job description:
${jobDescription.slice(0, 1500)}

Instructions:
- Output ONLY the rewritten bullet points, grouped by role/section if possible
- Use strong action verbs and quantify impact where the original has numbers
- Mirror keywords from the job description naturally — don't keyword-stuff
- Keep each bullet under 2 lines
- Do not invent experience that isn't in the original resume`;

  const text = await callLLM(prompt, settings);
  return { text };
}
