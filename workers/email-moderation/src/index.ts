const MAX_EMAILS_PER_DAY = 10
const MAX_EMAIL_SIZE_KB = 100
const MAX_EMAIL_SIZE_BYTES = MAX_EMAIL_SIZE_KB * 1024

interface SpamCheckResult {
  isSpam: boolean
  reason: string
  skipAI: boolean
}

function extractSender(emailData: any): string {
  const from = emailData.from || ''
  const match = from.match(/<(.+)>/)
  return match ? match[1].toLowerCase() : from.toLowerCase()
}

function isThreadReply(headers: Record<string, string>): boolean {
  const inReplyTo = headers['in-reply-to'] || headers['In-Reply-To'] || ''
  const references = headers['references'] || headers['References'] || ''
  const subject = headers['subject'] || headers['Subject'] || ''
  
  const isReply = inReplyTo.length > 0 || references.length > 0
  const hasRePrefix = /^re:\s/i.test(subject)
  
  return isReply || hasRePrefix
}

async function checkRateLimit(sender: string, kv: any): Promise<SpamCheckResult> {
  const today = new Date().toISOString().split('T')[0]
  const key = `rate:${sender}:${today}`
  
  try {
    const countStr = await kv.get(key) as string | null
    const count = countStr ? parseInt(countStr, 10) : 0
    
    if (count >= MAX_EMAILS_PER_DAY) {
      return {
        isSpam: true,
        reason: `Rate limit exceeded: ${count} emails today (limit: ${MAX_EMAILS_PER_DAY})`,
        skipAI: true
      }
    }
    
    await kv.put(key, String(count + 1), { expirationTtl: 86400 })
    
    return { isSpam: false, reason: '', skipAI: false }
  } catch (e) {
    console.error('[Spam] Rate limit check failed:', e)
    return { isSpam: false, reason: '', skipAI: false }
  }
}

function checkEmailSize(textContent: string, htmlContent: string): SpamCheckResult {
  const totalSize = (textContent.length + htmlContent.length) * 2
  
  if (totalSize > MAX_EMAIL_SIZE_BYTES) {
    return {
      isSpam: true,
      reason: `Email too large: ${Math.round(totalSize / 1024)}KB (limit: ${MAX_EMAIL_SIZE_KB}KB)`,
      skipAI: true
    }
  }
  
  return { isSpam: false, reason: '', skipAI: false }
}

function isSuspiciousContent(text: string, subject: string): boolean {
  const combined = `${subject} ${text}`.toLowerCase()
  
  const suspiciousPatterns = [
    /\b(viagra|casino|lottery|winner|inheritance|million dollars)\b/i,
    /click here.*now/i,
    /verify.*account.*urgent/i,
    /bank.*transfer.*urgent/i
  ]
  
  const excessiveCaps = text.replace(/[^A-Z]/g, '').length / (text.length || 1) > 0.7
  const manyLinks = (text.match(/https?:\/\//gi) || []).length > 10
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(combined)) {
      return true
    }
  }
  
  return excessiveCaps || manyLinks
}

async function updateUsageStats(kv: any, action: 'email' | 'ai' | 'discord'): Promise<void> {
  const today = new Date().toISOString().split('T')[0]
  const key = `stats:${today}`
  
  try {
    const existing = await kv.get(key) as string | null
    const stats = existing ? JSON.parse(existing) : { emails: 0, aiCalls: 0, discordSends: 0 }
    
    if (action === 'email') stats.emails++
    if (action === 'ai') stats.aiCalls++
    if (action === 'discord') stats.discordSends++
    
    await kv.put(key, JSON.stringify(stats), { expirationTtl: 604800 })
  } catch (e) {
    console.error('[Stats] Update failed:', e)
  }
}

async function logSpamAttempt(sender: string, reason: string, webhookUrl: string): Promise<void> {
  if (!webhookUrl) return
  
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: '🚨 Spam Attempt Blocked',
          description: `**From:** ${sender}\n**Reason:** ${reason}`,
          color: 0xe74c3c,
          timestamp: new Date().toISOString()
        }]
      })
    })
  } catch (e) {
    console.error('[Spam] Log failed:', e)
  }
}

async function handleStats(kv: any): Promise<Response> {
  try {
    const today = new Date().toISOString().split('T')[0]
    const statsKey = `stats:${today}`
    const yesterdayDate = new Date()
    yesterdayDate.setDate(yesterdayDate.getDate() - 1)
    const yesterday = yesterdayDate.toISOString().split('T')[0]
    const yesterdayKey = `stats:${yesterday}`
    
    const [todayStatsStr, yesterdayStatsStr] = await Promise.all([
      kv.get(statsKey) as Promise<string | null>,
      kv.get(yesterdayKey) as Promise<string | null>
    ])
    
    const todayStats = todayStatsStr ? JSON.parse(todayStatsStr) : null
    const yesterdayStats = yesterdayStatsStr ? JSON.parse(yesterdayStatsStr) : null
    
    const estimatedCost = {
      today: todayStats ? (todayStats.emails * 0.00002).toFixed(4) : '0.0000',
      month: todayStats ? (todayStats.emails * 30 * 0.00002).toFixed(2) : '0.00'
    }
    
    return new Response(JSON.stringify({
      date: today,
      stats: todayStats || { emails: 0, aiCalls: 0, discordSends: 0 },
      yesterday: yesterdayStats || { emails: 0, aiCalls: 0, discordSends: 0 },
      estimatedCostUSD: estimatedCost,
      limits: {
        maxEmailsPerDay: MAX_EMAILS_PER_DAY,
        maxEmailSizeKB: MAX_EMAIL_SIZE_KB
      }
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (e) {
    console.error('[Stats] Fetch error:', e)
    return new Response(JSON.stringify({ error: 'Failed to fetch stats' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

export default {
  async email(message: any, env: any, ctx: any) {
    console.log('[Worker] Email received')
    
    try {
      const emailId = `email_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
      console.log(`[Worker] Processing email: ${emailId}`)
      
      const headers: Record<string, string> = {}
      if (message.headers && typeof message.headers.entries === 'function') {
        for (const [key, value] of message.headers.entries()) {
          headers[key.toLowerCase()] = value
        }
      } else if (message.headers && typeof message.headers === 'object') {
        for (const key of Object.keys(message.headers)) {
          const value = (message.headers as any)[key]
          headers[key.toLowerCase()] = Array.isArray(value) ? value[0] : value
        }
      }
      console.log(`[Worker] Headers extracted: ${Object.keys(headers).length} headers`)
      
      let textContent = ''
      try {
        textContent = await message.text()
      } catch (e) {
        console.log('[Worker] Could not extract text content')
      }
      
      let htmlContent = ''
      try {
        htmlContent = await message.html()
      } catch (e) {
        console.log('[Worker] Could not extract HTML content')
      }
      
      const emailData = {
        id: emailId,
        from: String(message.from || 'unknown'),
        to: String(message.to || 'unknown'),
        subject: headers['subject'] || headers['Subject'] || '(No subject)',
        text: textContent,
        html: htmlContent || undefined,
        date: new Date().toISOString(),
        attachments: [] as any[],
        headers
      }
      
      if (message.attachments && Array.isArray(message.attachments)) {
        emailData.attachments = message.attachments.map((a: any, i: number) => ({
          name: a.name || `attachment_${i}`,
          size: a.size || 0,
          type: a.type || 'application/octet-stream'
        }))
      }
      
      console.log(`[Worker] Email from: ${emailData.from}, subject: ${emailData.subject}`)
      
      const sender = extractSender(emailData)
      let isSuspiciousContentDetected = false
      
      if (isThreadReply(headers)) {
        console.log(`[Worker] Skipping thread reply from ${sender}`)
        return
      }
      
      if (env.EMAIL_APPROVAL_KV) {
        const sizeCheck = checkEmailSize(textContent, htmlContent)
        if (sizeCheck.isSpam) {
          console.log(`[Worker] Spam detected: ${sizeCheck.reason}`)
          await logSpamAttempt(sender, sizeCheck.reason, env.DISCORD_LOG_WEBHOOK_URL)
          return
        }
        
        const rateCheck = await checkRateLimit(sender, env.EMAIL_APPROVAL_KV)
        if (rateCheck.isSpam) {
          console.log(`[Worker] Rate limit hit: ${sender} - ${rateCheck.reason}`)
          await logSpamAttempt(sender, rateCheck.reason, env.DISCORD_LOG_WEBHOOK_URL)
          return
        }
        
        if (isSuspiciousContent(textContent, emailData.subject)) {
          console.log(`[Worker] Suspicious content detected from ${sender}`)
          isSuspiciousContentDetected = true
          await logSpamAttempt(sender, 'Suspicious content patterns detected', env.DISCORD_LOG_WEBHOOK_URL)
        }
        
        await updateUsageStats(env.EMAIL_APPROVAL_KV, 'email')
      }
      
      const category = classifyEmail(emailData)
      console.log(`[Worker] Category: ${category}`)
      
      let aiReply: string | null = null
      if (env.GEMINI_API_KEY) {
        try {
          console.log('[Worker] Generating AI reply...')
          aiReply = await generateAIReply(emailData, category, env.GEMINI_API_KEY)
          if (aiReply) {
            console.log('[Worker] AI reply generated successfully')
          }
        } catch (e) {
          console.log('[Worker] AI reply generation failed:', e)
        }
      }
      
      const pendingEmail = {
        ...emailData,
        aiReply,
        suggestedTone: getSuggestedTone(category),
        detectedCategory: category,
        status: 'pending',
        createdAt: Date.now(),
        isSuspicious: isSuspiciousContentDetected
      }
      
      if (env.EMAIL_APPROVAL_KV) {
        try {
          await env.EMAIL_APPROVAL_KV.put(
            `email:${emailId}`,
            JSON.stringify(pendingEmail),
            { expirationTtl: 604800 }
          )
          console.log('[Worker] Email saved to KV')
        } catch (e) {
          console.log('[Worker] KV save failed:', e)
        }
      } else {
        console.log('[Worker] KV not available')
      }
      
      if (env.DISCORD_BOT_TOKEN && env.DISCORD_APPROVAL_CHANNEL_ID) {
        try {
          const sent = await sendBotMessageWithButtons(
            env.DISCORD_BOT_TOKEN,
            env.DISCORD_APPROVAL_CHANNEL_ID,
            pendingEmail,
            isSuspiciousContentDetected
          )
          if (sent) {
            console.log('[Worker] Discord bot message sent with buttons')
          } else {
            console.log('[Worker] Discord bot message failed')
          }
        } catch (e) {
          console.log('[Worker] Discord bot error:', e)
        }
      } else {
        console.log('[Worker] DISCORD_BOT_TOKEN or DISCORD_APPROVAL_CHANNEL_ID not set')
      }
      
      if (env.DISCORD_LOG_WEBHOOK_URL) {
        try {
          await sendLogMessage(env.DISCORD_LOG_WEBHOOK_URL, '📬 New Email Received',
            `**From:** ${emailData.from}\n**Subject:** ${emailData.subject}\n**Category:** ${category}`,
            0xf1c40f)
        } catch (e) {
          console.log('[Worker] Log webhook error:', e)
        }
      }
      
      console.log('[Worker] Email processing complete')
      
    } catch (error) {
      console.error('[Worker] Error processing email:', error)
    }
  },

  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    
    if (path === '/' || path === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        service: 'email-moderation-worker',
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    if (path === '/interactions') {
      const requestType = request.headers.get('x-discord-request-type')
      
      if (requestType === '3' || request.method === 'GET') {
        const params = new URL(request.url).searchParams
        const challenge = params.get('challenge')
        if (challenge) {
          return new Response(challenge, {
            headers: { 'Content-Type': 'text/plain' }
          })
        }
      }
      
      if (request.method === 'POST') {
        const signature = request.headers.get('x-signature-ed25519')
        const timestamp = request.headers.get('x-signature-timestamp')
        
        const body = await request.text()
        
        if (!signature || !timestamp || !env.DISCORD_PUBLIC_KEY) {
          return handleInteractionRaw(body, env)
        }
        
        const isValid = await verifyDiscordSignature(body, timestamp, signature, env.DISCORD_PUBLIC_KEY)
        
        if (!isValid) {
          console.warn('[Worker] Invalid Discord signature')
          return new Response('Invalid signature', { status: 401 })
        }
        
        return handleInteractionRaw(body, env)
      }
    }
    
    if (path === '/edit-submit' && request.method === 'POST') {
      return handleEditSubmit(request, env)
    }
    
    if (path === '/stats' && request.method === 'GET') {
      if (env.EMAIL_APPROVAL_KV) {
        return handleStats(env.EMAIL_APPROVAL_KV)
      }
      return new Response(JSON.stringify({ error: 'KV not available' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    if (path === '/api/routes/discord-submit' && request.method === 'POST') {
      return handleRouteDiscordSubmit(request, env)
    }
    
    return new Response('Not Found', { status: 404 })
  }
}

function classifyEmail(emailData: any): string {
  const subject = (emailData.subject || '').toLowerCase()
  const text = (emailData.text || '').toLowerCase()
  const combined = `${subject} ${text}`
  
  if (combined.includes('urgent') || combined.includes('emergency') || combined.includes('critical') || combined.includes('asap')) {
    return 'urgent'
  }
  if (combined.includes('bug') || combined.includes('error') || combined.includes('crash') || combined.includes('broken')) {
    return 'bug_report'
  }
  if (combined.includes('partnership') || combined.includes('collaboration') || combined.includes('business')) {
    return 'partnership'
  }
  if (combined.includes('feature') || combined.includes('request') || combined.includes('suggestion')) {
    return 'feature_request'
  }
  if (combined.includes('feedback') || combined.includes('improvement')) {
    return 'feedback'
  }
  if (combined.includes('question') || combined.includes('how') || combined.includes('?')) {
    return 'question'
  }
  
  return 'general_inquiry'
}

function getSuggestedTone(category: string): string {
  const toneMap: Record<string, string> = {
    bug_report: 'apologetic_professional',
    feature_request: 'appreciative_enthusiastic',
    question: 'helpful_clear',
    general_inquiry: 'friendly_professional',
    partnership: 'professional_business',
    feedback: 'grateful_responsive',
    urgent: 'urgent_caring'
  }
  return toneMap[category] || 'friendly_professional'
}

async function generateAIReply(emailData: any, category: string, apiKey: string): Promise<string | null> {
  if (!apiKey) return null

  try {
    const prompt = `Write a direct email reply (100-200 words).

Context: gsyrocks.com is a Guernsey climbing routes website.

Original email:
Subject: ${emailData.subject}
Content: ${emailData.text}

Requirements:
- Start directly with greeting (e.g., "Hi name,") - no conversational filler
- Be professional and helpful
- No "Here's a draft" or similar phrases
- No mention of the original subject line
- Sign off with "The gsyrocks Team"
- Keep concise and direct

Email reply content:`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500
          }
        })
      }
    )

    if (!response.ok) {
      const status = response.status
      console.log('[AI] API error:', status)
      if (status === 429) {
        return '[AI] Unable to generate reply - rate limit exceeded. Please edit and send a manual reply.'
      }
      return null
    }

    const data = await response.json() as { candidates?: any[] }
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text
    return reply?.trim() || null

  } catch (error) {
    console.error('[AI] Error:', error)
    return '[AI] Unable to generate reply - an error occurred. Please edit and send a manual reply.'
  }
}

function getDefaultReply(email: any): string {
  const name = (email.from || '').split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
  return `Hi ${name},

Thanks for contacting us at gsyrocks.com!

We've received your message and appreciate you reaching out. A team member will review your email and get back to you soon.

Best regards,
The gsyrocks Team`
}

function getFallbackReply(): string {
  return `Thank you for contacting us at gsyrocks.com!

We've received your message. Unfortunately, we were unable to generate an automated reply due to a rate limit.

A team member will review your email and respond as soon as possible.

Best regards,
The gsyrocks Team`
}

async function sendBotMessageWithButtons(botToken: string, channelId: string, email: any, isSuspicious: boolean = false): Promise<boolean> {
  const categoryInfo: Record<string, { emoji: string; label: string }> = {
    bug_report: { emoji: '🐛', label: 'Bug Report' },
    feature_request: { emoji: '✨', label: 'Feature Request' },
    question: { emoji: '❓', label: 'Question' },
    general_inquiry: { emoji: '💬', label: 'General Inquiry' },
    partnership: { emoji: '🤝', label: 'Partnership' },
    feedback: { emoji: '📝', label: 'Feedback' },
    urgent: { emoji: '🚨', label: 'Urgent' }
  }
  
  const info = categoryInfo[email.detectedCategory] || { emoji: '📧', label: 'Email' }
  const content = (email.text || '').substring(0, 500)
  
  const embedColor = isSuspicious ? 0xe74c3c : (email.detectedCategory === 'urgent' ? 0xe67e22 : 0xf1c40f)
  
  const embed: any = {
    title: isSuspicious ? `⚠️ ${info.emoji} New Email - ${info.label}` : `${info.emoji} New Email - ${info.label}`,
    description: `**Subject:** ${email.subject}`,
    color: embedColor,
    fields: [
      { name: '📧 From', value: email.from, inline: true },
      { name: '📅 Received', value: new Date(email.date).toLocaleString(), inline: true },
      { name: '💬 Content', value: content + (email.text?.length > 500 ? '...' : '') }
    ],
    timestamp: new Date().toISOString(),
    footer: { text: `ID: ${email.id}` }
  }
  
  if (isSuspicious) {
    embed.fields.unshift({
      name: '⚠️ Warning',
      value: 'This email has suspicious characteristics. Review carefully before responding.',
      inline: false
    })
  }
  
  if (email.aiReply) {
    embed.fields.push({
      name: '🤖 AI Suggested Reply',
      value: '```' + email.aiReply.substring(0, 400) + '```' + (email.aiReply.length > 400 ? '\n*...*' : '')
    })
  }

  try {
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: '📬 **New email received!** A team member needs to review and respond.',
        embeds: [embed],
        components: [
          {
            type: 1,
            components: [
              { type: 2, style: 3, label: '✅ Approve & Send', custom_id: `approve_${email.id}` },
              { type: 2, style: 4, label: '❌ Reject', custom_id: `reject_${email.id}` }
            ]
          },
          {
            type: 1,
            components: [
              { type: 2, style: 1, label: '✏️ Edit & Send', custom_id: `edit_${email.id}` },
              { type: 2, style: 2, label: '📋 View Full', custom_id: `view_${email.id}` }
            ]
          }
        ]
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.log('[Discord Bot] API error:', response.status, errorText)
    }
    
    return response.ok
  } catch (error) {
    console.error('[Discord Bot] Error:', error)
    return false
  }
}

async function handleInteractionRaw(body: string, env: any): Promise<Response> {
  try {
    const interaction = JSON.parse(body)
    
    if (interaction.type === 1) {
      return new Response(JSON.stringify({ type: 1 }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    if (interaction.type === 3) {
      const customId = interaction.data?.custom_id
      if (!customId) {
        return new Response(JSON.stringify({
          type: 4,
          data: { content: 'Error: No custom_id', flags: 64 }
        }), { headers: { 'Content-Type': 'application/json' } })
      }
      
      const parts = customId.split('_')
      const action = parts[0]
      const id = parts.slice(1).join('_')
      
      const userId = interaction.member?.user?.id || interaction.user?.id || 'unknown'
      console.log(`[Worker] Action: ${action} on ${id} by ${userId}`)
      
      if (action === 'approve' || action === 'reject' || action === 'view' || action === 'edit') {
        let dataStr = ''
        if (env.EMAIL_APPROVAL_KV) {
          dataStr = await env.EMAIL_APPROVAL_KV.get(`email:${id}`, 'text') as string
        }
        
        if (!dataStr) {
          return new Response(JSON.stringify({
            type: 4,
            data: { content: 'Email not found or expired', flags: 64 }
          }), { headers: { 'Content-Type': 'application/json' } })
        }
        
        const data = JSON.parse(dataStr)
        
        switch (action) {
          case 'approve':
            return await handleApprove(data, env, userId)
          case 'reject':
            return await handleReject(data, env, userId)
          case 'view':
            return await handleView(data, env, userId)
          case 'edit':
            return handleEdit(data)
          default:
            return new Response(JSON.stringify({
              type: 4,
              data: { content: `Unknown action: ${action}`, flags: 64 }
            }), { headers: { 'Content-Type': 'application/json' } })
        }
      }
      
      if (action === 'approve_route' || action === 'reject_route') {
        let routeDataStr = ''
        if (env.ROUTE_APPROVAL_KV) {
          routeDataStr = await env.ROUTE_APPROVAL_KV.get(`route:${id}`, 'text') as string
        }
        
        if (!routeDataStr) {
          return new Response(JSON.stringify({
            type: 4,
            data: { content: 'Route not found or expired', flags: 64 }
          }), { headers: { 'Content-Type': 'application/json' } })
        }
        
        const route = JSON.parse(routeDataStr) as RouteSubmission
        
        switch (action) {
          case 'approve_route':
            return await handleApproveRoute(route, env, userId)
          case 'reject_route':
            return await handleRejectRoute(route, env, userId)
          default:
            return new Response(JSON.stringify({
              type: 4,
              data: { content: `Unknown route action: ${action}`, flags: 64 }
            }), { headers: { 'Content-Type': 'application/json' } })
        }
      }
      
      return new Response(JSON.stringify({
        type: 4,
        data: { content: `Unknown action: ${action}`, flags: 64 }
      }), { headers: { 'Content-Type': 'application/json' } })
    }
    
    return new Response(JSON.stringify({ type: 0 }), {
      headers: { 'Content-Type': 'application/json' }
    })
    
  } catch (error) {
    console.error('[Worker] Interaction error:', error)
    return new Response(JSON.stringify({
      type: 4,
      data: { content: 'Error processing interaction', flags: 64 }
    }), { headers: { 'Content-Type': 'application/json' } })
  }
}

async function verifyDiscordSignature(
  body: string,
  timestamp: string,
  signature: string,
  publicKey: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder()
    
    const keyData = hexToUint8Array(publicKey)
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData.buffer as ArrayBuffer,
      { name: 'Ed25519', namedCurve: 'Ed25519' },
      true,
      ['verify']
    )
    
    const sigBytes = hexToUint8Array(signature)
    const data = encoder.encode(timestamp + body)
    
    return await crypto.subtle.verify('Ed25519', cryptoKey, sigBytes.buffer as ArrayBuffer, data)
  } catch (error) {
    console.error('[Worker] Signature verification error:', error)
    return false
  }
}

function hexToUint8Array(hex: string): Uint8Array {
  hex = hex.replace(/^0x/, '')
  if (hex.length % 2 !== 0) {
    hex = '0' + hex
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

async function handleApprove(email: any, env: any, userId: string): Promise<Response> {
  const reply = email.aiReply || getDefaultReply(email)
  
  const sent = await sendReplyEmail(env.RESEND_API_KEY, email, reply)
  
  if (sent) {
    if (env.EMAIL_APPROVAL_KV) {
      await env.EMAIL_APPROVAL_KV.put(`email:${email.id}`, JSON.stringify({
        ...email,
        status: 'approved',
        updatedAt: Date.now(),
        reviewedBy: userId,
        sentReply: reply
      }))
    }
    
    if (env.DISCORD_LOG_WEBHOOK_URL) {
      await sendLogMessage(env.DISCORD_LOG_WEBHOOK_URL, '✅ Reply Sent',
        `**To:** ${email.from}\n**By:** <@${userId}>`, 0x2ecc71)
    }
    
    return new Response(JSON.stringify({
      type: 4,
      data: { content: `✅ Reply sent to ${email.from}`, flags: 64 }
    }), { headers: { 'Content-Type': 'application/json' } })
  }
  
  return new Response(JSON.stringify({
    type: 4,
    data: { content: '❌ Failed to send email', flags: 64 }
  }), { headers: { 'Content-Type': 'application/json' } })
}

async function handleReject(email: any, env: any, userId: string): Promise<Response> {
  if (env.EMAIL_APPROVAL_KV) {
    await env.EMAIL_APPROVAL_KV.put(`email:${email.id}`, JSON.stringify({
      ...email,
      status: 'rejected',
      updatedAt: Date.now(),
      reviewedBy: userId
    }))
  }
  
  if (env.DISCORD_LOG_WEBHOOK_URL) {
    await sendLogMessage(env.DISCORD_LOG_WEBHOOK_URL, '❌ Email Rejected',
      `**From:** ${email.from}\n**By:** <@${userId}>`, 0xe74c3c)
  }
  
  return new Response(JSON.stringify({
    type: 4,
    data: { content: `❌ Email from ${email.from} rejected`, flags: 64 }
  }), { headers: { 'Content-Type': 'application/json' } })
}

async function handleView(email: any, env: any, userId: string): Promise<Response> {
  const fullContent = `**Full Email**
From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}

${email.text}

${email.attachments?.length > 0 ? `Attachments: ${email.attachments.map((a: any) => a.name).join(', ')}` : 'No attachments'}

---

**AI Suggested Reply:**
${email.aiReply || 'No AI reply generated'}`
  
  if (env.DISCORD_LOG_WEBHOOK_URL) {
    await sendLogMessage(env.DISCORD_LOG_WEBHOOK_URL, '📋 Full Email Viewed',
      `**From:** ${email.from}\n**Viewed by:** <@${userId}>`, 0x3498db)
  }
  
  return new Response(JSON.stringify({
    type: 4,
    data: { content: `📧 **Full Email Details**\n\n${fullContent.substring(0, 1900)}`, flags: 64 }
  }), { headers: { 'Content-Type': 'application/json' } })
}

async function sendReplyEmail(apiKey: string, email: any, replyContent: string): Promise<boolean> {
  if (!apiKey) return false

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'gsyrocks.com <hello@gsyrocks.com>',
        to: [email.from],
        subject: `Re: ${email.subject}`,
        text: replyContent
      })
    })
    return response.ok
  } catch (error) {
    console.error('[Email] Send error:', error)
    return false
  }
}

async function sendLogMessage(webhookUrl: string, title: string, description: string, color: number): Promise<void> {
  if (!webhookUrl) return
  
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{ title, description, color, timestamp: new Date().toISOString() }]
      })
    })
  } catch (error) {
    console.error('[Log] Error:', error)
  }
}

function handleEdit(email: any): Response {
  const defaultReply = email.aiReply || getDefaultReply(email)
  return new Response(JSON.stringify({
    type: 9,
    data: {
      custom_id: `edit_modal_${email.id}`,
      title: 'Edit Email Reply',
      components: [
        {
          type: 1,
          components: [{
            type: 4,
            custom_id: 'reply_content',
            label: 'Reply Content',
            style: 2,
            value: defaultReply,
            required: true,
            min_length: 10,
            max_length: 4000
          }]
        }
      ]
    }
  }), { headers: { 'Content-Type': 'application/json' } })
}

async function handleEditSubmit(request: Request, env: any): Promise<Response> {
  try {
    const body = await request.json() as { custom_id?: string; components?: any[] }
    const custom_id = body.custom_id || ''
    const components = body.components || []
    
    if (!custom_id.startsWith('edit_modal_')) {
      return new Response(JSON.stringify({ error: 'Invalid custom_id' }), { status: 400 })
    }
    
    const emailId = custom_id.replace('edit_modal_', '')
    const replyContent = components[0]?.components?.[0]?.value
    
    if (!replyContent) {
      return new Response(JSON.stringify({
        type: 4,
        data: { content: 'Error: No reply content provided', flags: 64 }
      }), { headers: { 'Content-Type': 'application/json' } })
    }
    
    let emailDataStr = ''
    if (env.EMAIL_APPROVAL_KV) {
      emailDataStr = await env.EMAIL_APPROVAL_KV.get(`email:${emailId}`, 'text') as string
    }
    
    if (!emailDataStr) {
      return new Response(JSON.stringify({
        type: 4,
        data: { content: 'Email not found or expired', flags: 64 }
      }), { headers: { 'Content-Type': 'application/json' } })
    }
    
    const email = JSON.parse(emailDataStr)
    
    const sent = await sendReplyEmail(env.RESEND_API_KEY, email, replyContent)
    
    if (sent) {
      if (env.EMAIL_APPROVAL_KV) {
        await env.EMAIL_APPROVAL_KV.put(`email:${emailId}`, JSON.stringify({
          ...email,
          status: 'edited',
          updatedAt: Date.now(),
          sentReply: replyContent
        }))
      }
      
      if (env.DISCORD_LOG_WEBHOOK_URL) {
        await sendLogMessage(env.DISCORD_LOG_WEBHOOK_URL, '✏️ Edited Reply Sent',
          `**To:** ${email.from}\n**Content:** ${replyContent.substring(0, 100)}...`, 0x3498db)
      }
      
      return new Response(JSON.stringify({
        type: 4,
        data: { content: `✅ Edited reply sent to ${email.from}`, flags: 64 }
      }), { headers: { 'Content-Type': 'application/json' } })
    }
    
    return new Response(JSON.stringify({
      type: 4,
      data: { content: '❌ Failed to send edited email', flags: 64 }
    }), { headers: { 'Content-Type': 'application/json' } })
    
  } catch (error) {
    console.error('[Worker] Edit submit error:', error)
    return new Response(JSON.stringify({
      type: 4,
      data: { content: 'Error processing edited reply', flags: 64 }
    }), { headers: { 'Content-Type': 'application/json' } })
  }
}

interface RouteSubmission {
  id: string
  name: string
  grade: string
  imageUrl: string
  latitude: number
  longitude: number
  submittedBy: string
  submittedByEmail: string
  status: string
  discordMessageId?: string
  createdAt: number
}

async function handleRouteDiscordSubmit(request: Request, env: any): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization')
    const expectedToken = env.WORKER_API_KEY

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    const body = await request.json() as RouteSubmission
    const { id: routeId, name, grade, imageUrl, latitude, longitude, submittedBy, submittedByEmail } = body

    if (!routeId || !name || !grade || !imageUrl || !latitude || !longitude) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const route: RouteSubmission = {
      id: routeId,
      name,
      grade,
      imageUrl,
      latitude,
      longitude,
      submittedBy: submittedBy || 'Anonymous',
      submittedByEmail: submittedByEmail || '',
      status: 'discord_pending',
      createdAt: Date.now()
    }

    if (env.ROUTE_APPROVAL_KV) {
      await env.ROUTE_APPROVAL_KV.put(`route:${routeId}`, JSON.stringify(route))
    }

    const channelId = env.DISCORD_ROUTE_APPROVAL_CHANNEL_ID
    const botToken = env.DISCORD_BOT_TOKEN

    if (channelId && botToken) {
      const result = await sendRouteApprovalMessage(botToken, channelId, route)

      if (result.success && result.messageId) {
        if (env.ROUTE_APPROVAL_KV) {
          await env.ROUTE_APPROVAL_KV.put(`route:${routeId}`, JSON.stringify({
            ...route,
            discordMessageId: result.messageId
          }))
        }

        return new Response(JSON.stringify({ 
          success: true, 
          messageId: result.messageId 
        }), {
          headers: { 'Content-Type': 'application/json' }
        })
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      warning: 'Discord notification not sent'
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('[Route Submit] Error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

// ==========================================
// ROUTE APPROVAL FUNCTIONS
// ==========================================

const MAX_ROUTES_PER_DAY = 5

async function sendRouteApprovalMessage(
  botToken: string,
  channelId: string,
  route: RouteSubmission
): Promise<{ success: boolean; messageId?: string }> {
  const embed = {
    title: '🧗 New Route Submission',
    color: 0xf1c40f,
    fields: [
      { name: '🧗 Route', value: route.name, inline: true },
      { name: '📊 Grade', value: route.grade, inline: true },
      { name: '📍 Location', value: `${route.latitude.toFixed(4)}, ${route.longitude.toFixed(4)}`, inline: true },
      { name: '👤 Submitted by', value: route.submittedBy, inline: true },
      { name: '🕐 Submitted', value: new Date(route.createdAt).toLocaleString(), inline: true },
      { name: '🔗 Link', value: `https://gsyrocks.com/climb/${route.id}`, inline: true }
    ],
    image: { url: route.imageUrl },
    timestamp: new Date().toISOString(),
    footer: { text: `Route ID: ${route.id}` }
  }

  try {
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${botToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: '🧗 **New route submitted for approval!**',
        embeds: [embed],
        components: [
          {
            type: 1,
            components: [
              { type: 2, style: 3, label: '✅ Approve', custom_id: `approve_route_${route.id}` },
              { type: 2, style: 4, label: '❌ Reject', custom_id: `reject_route_${route.id}` }
            ]
          }
        ]
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.log('[Route Discord Bot] API error:', response.status, errorText)
      return { success: false }
    }

    const messageData = await response.json() as { id?: string }
    return { success: true, messageId: messageData.id }
  } catch (error) {
    console.error('[Route Discord Bot] Error:', error)
    return { success: false }
  }
}

async function handleApproveRoute(route: RouteSubmission, env: any, userId: string): Promise<Response> {
  try {
    if (env.ROUTE_APPROVAL_KV) {
      await env.ROUTE_APPROVAL_KV.put(`route:${route.id}`, JSON.stringify({
        ...route,
        status: 'approved',
        updatedAt: Date.now(),
        reviewedBy: userId,
        reviewedAt: Date.now()
      }))
    }

    const supabaseUrl = env.SUPABASE_URL
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY

    if (supabaseUrl && supabaseKey) {
      const updateResponse = await fetch(`${supabaseUrl}/rest/v1/climbs?id=eq.${route.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          status: 'approved',
          approved_at: new Date().toISOString()
        })
      })
      
      if (!updateResponse.ok) {
        console.error('[Route] Failed to update climb in Supabase:', await updateResponse.text())
      }
    }

    if (route.submittedByEmail) {
      await sendRouteApprovalEmail(
        env.RESEND_API_KEY,
        route.submittedByEmail,
        route.name,
        true
      )
    }

    if (env.DISCORD_LOG_WEBHOOK_URL) {
      await sendLogMessage(env.DISCORD_LOG_WEBHOOK_URL, '✅ Route Approved',
        `**Route:** ${route.name}\n**Grade:** ${route.grade}\n**Approved by:** <@${userId}>`,
        0x2ecc71
      )
    }

    return new Response(JSON.stringify({
      type: 4,
      data: { content: `✅ Route "${route.name}" approved!`, flags: 64 }
    }), { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('[Route] Approve error:', error)
    return new Response(JSON.stringify({
      type: 4,
      data: { content: '❌ Error approving route', flags: 64 }
    }), { headers: { 'Content-Type': 'application/json' } })
  }
}

async function handleRejectRoute(route: RouteSubmission, env: any, userId: string): Promise<Response> {
  try {
    if (env.ROUTE_APPROVAL_KV) {
      await env.ROUTE_APPROVAL_KV.put(`route:${route.id}`, JSON.stringify({
        ...route,
        status: 'rejected',
        updatedAt: Date.now(),
        reviewedBy: userId,
        reviewedAt: Date.now()
      }))
    }

    const supabaseUrl = env.SUPABASE_URL
    const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY

    if (supabaseUrl && supabaseKey) {
      const deleteResponse = await fetch(`${supabaseUrl}/rest/v1/climbs?id=eq.${route.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      })

      if (!deleteResponse.ok) {
        console.error('[Route] Failed to delete climb from Supabase:', await deleteResponse.text())
      }
    }

    if (route.submittedByEmail) {
      await sendRouteApprovalEmail(
        env.RESEND_API_KEY,
        route.submittedByEmail,
        route.name,
        false
      )
    }

    if (env.DISCORD_LOG_WEBHOOK_URL) {
      await sendLogMessage(env.DISCORD_LOG_WEBHOOK_URL, '❌ Route Rejected',
        `**Route:** ${route.name}\n**Grade:** ${route.grade}\n**Rejected by:** <@${userId}>`,
        0xe74c3c
      )
    }

    return new Response(JSON.stringify({
      type: 4,
      data: { content: `❌ Route "${route.name}" rejected`, flags: 64 }
    }), { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('[Route] Reject error:', error)
    return new Response(JSON.stringify({
      type: 4,
      data: { content: '❌ Error rejecting route', flags: 64 }
    }), { headers: { 'Content-Type': 'application/json' } })
  }
}

async function sendRouteApprovalEmail(
  apiKey: string,
  email: string,
  routeName: string,
  approved: boolean
): Promise<boolean> {
  if (!apiKey) return false

  try {
    const subject = approved 
      ? `✅ Your route "${routeName}" has been approved!`
      : `❌ Your route "${routeName}" was not approved`

    const text = approved
      ? `Great news! Your route "${routeName}" has been approved and is now live on the map.\n\nThank you for contributing to gsyrocks.com!`
      : `Unfortunately, your route "${routeName}" was not approved.\n\nIf you believe this is an error, please feel free to resubmit with additional information.\n\nThank you for trying!`

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'gsyrocks.com <hello@gsyrocks.com>',
        to: [email],
        subject,
        text
      })
    })

    return response.ok
  } catch (error) {
    console.error('[Route Email] Send error:', error)
    return false
  }
}

export type { RouteSubmission }
export { sendRouteApprovalMessage, handleApproveRoute, handleRejectRoute }
