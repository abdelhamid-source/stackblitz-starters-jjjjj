import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      lessonText,
      config,
      selectedLenses,
      type,
      chatHistory,
      userMessage,
      lensContext,
      userApiKey,
    } = body;
    const apiKey = process.env.OPENAI_API_KEY ?? '';
    if (!apiKey)
      return NextResponse.json({ error: 'API Key Missing' }, { status: 401 });
    const openai = new OpenAI({ apiKey });

    // --- MODE: PRIZE ---
    if (type === 'prize') {
      const prizePrompt = `You are an Elite Teacher Mentor. Transform the following lesson into an elite-level, enhanced lesson plan. Grade: ${config.grade}, Subject: ${config.subject}, Profile: ${config.profile}, Time: ${config.minutes}m. Return ONLY a JSON object with EXACTLY these string keys: "Lesson Title", "Subject", "Grade Level", "Unit", "Section", "Objectives", "Materials Needed", "Anticipatory Set/Hook", "Direct Instruction", "Guided Practice", "Independent Practice", "Game Review", "Closure/Homework", "Assessment", "Differentiation". Make the content top-tier and highly detailed. TIME-AWARE: For every instructional phase (Anticipatory Set, Direct Instruction, Guided Practice, Independent Practice, Game Review, Closure), explicitly state the allocated time (e.g., "[10 minutes]") at the start of its description. Ensure all phases sum exactly to ${config.minutes}m.`;
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: prizePrompt },
          { role: 'user', content: lessonText },
        ],
        response_format: { type: 'json_object' },
      });
      return NextResponse.json(
        JSON.parse(response.choices[0].message.content || '{}')
      );
    }

    // --- MODE: MATERIALIZER ---
    if (type === 'materializer') {
      const matPrompt = `You are an Elite Teacher Mentor using the absolute best, most advanced AI logic. Create an engaging, highly creative, EXTREMELY LONG and thoroughly developed printable student Worksheet/Material based exactly on this lesson. Grade: ${config.grade}, Subject: ${config.subject}, Profile: ${config.profile}, Time: ${config.minutes}m. 
      TEACHER'S CUSTOM INSTRUCTIONS: "${userMessage || 'Create a comprehensive standard worksheet.'}" -> YOU MUST STRICTLY FOLLOW THESE INSTRUCTIONS.
      Return ONLY a JSON object with three keys: "html" (string), "requiresImage" (boolean), and "imagePrompt" (string). 
      The "html" value must be a fully styled HTML document using inline CSS (e.g., modern readable fonts like 'Comic Sans MS', 'Nunito', or 'Arial', optimal font size 14pt-16pt, generous line spacing). For ANY charts, quadrants, or grids, YOU MUST use proper HTML <table border="1" cellpadding="20" style="border-collapse: collapse; width: 100%; table-layout: fixed; word-wrap: break-word; min-height: 400px; text-align: left; font-size: 14pt;"> with padded <td> cells (padding: 20px; height: 150px;).
      Ensure EVERY single activity requested is extensively developed with a MINIMUM OF 7 items/sentences/stations per activity. If cut-and-paste is requested, build a "Cut-Out Sheet" using CSS dashed borders.
      IMPORTANT IMAGE LOGIC: You MUST set "requiresImage" to true and write a description in "imagePrompt" for a set of 3 related objects that perfectly capture the lesson's main visual activity, putting "{{IMAGE_PLACEHOLDER}}" exactly where it belongs in the HTML.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: matPrompt },
          { role: 'user', content: lessonText },
        ],
        response_format: { type: 'json_object' },
      });

      let resultObj = JSON.parse(response.choices[0].message.content || '{}');

      if (resultObj.requiresImage && resultObj.imagePrompt) {
        try {
          const finalImagePrompt =
            resultObj.imagePrompt +
            ' STRICT RULES: Create exactly 1 single distinct object. Use a simple black-and-white clipart 2D line-art style, pure snow-white background. No humans, faces, or eyes.';
          const i1 = openai.images.generate({ model: 'dall-e-3', prompt: finalImagePrompt + ' (Item 1).', n: 1, size: '1024x1024', response_format: 'b64_json' });
          const i2 = openai.images.generate({ model: 'dall-e-3', prompt: finalImagePrompt + ' (Item 2).', n: 1, size: '1024x1024', response_format: 'b64_json' });
          const i3 = openai.images.generate({ model: 'dall-e-3', prompt: finalImagePrompt + ' (Item 3).', n: 1, size: '1024x1024', response_format: 'b64_json' });
          const b64s = (await Promise.all([i1, i2, i3])).map((r) => r.data[0].b64_json || '');
          if (b64s.every((b) => b)) {
            const imgTag = `<div style="text-align:center; margin: 30px 0;">${b64s.map((b) => `<img src="data:image/png;base64,${b}" style="width:200px; height:200px; margin:15px; display:inline-block; background-color:white; border:2px dashed #000; padding:10px;" />`).join('')}</div>`;
            resultObj.html = resultObj.html.replace('{{IMAGE_PLACEHOLDER}}', imgTag);
          } else {
            resultObj.html = resultObj.html.replace('{{IMAGE_PLACEHOLDER}}', '');
          }
        } catch (e) {
          console.error('Image generation failed:', e);
          resultObj.html = resultObj.html.replace('{{IMAGE_PLACEHOLDER}}', '');
        }
      } else if (resultObj.html) {
        resultObj.html = resultObj.html.replace('{{IMAGE_PLACEHOLDER}}', '');
      }
      return NextResponse.json(resultObj);
    }

    // --- MODE: GAMIFIER ---
    if (type === 'gamifier') {
      const gamePrompt = `You are an Elite Teacher Mentor. Create a 10-question multiple-choice trivia game based exactly on the elite lesson plan for this lesson. Return ONLY a JSON object with a single string key "csv". The value must be a raw CSV string formatted perfectly for Kahoot/Blooket import. The first line MUST be: Question,Answer 1,Answer 2,Answer 3,Answer 4,Time limit (sec),Correct answer(s). Time limit must be 20 for all. Correct answer(s) must be 1, 2, 3, or 4. Grade: ${config.grade}, Subject: ${config.subject}, Profile: ${config.profile}, Time: ${config.minutes}m.`;
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: gamePrompt },
          { role: 'user', content: lessonText },
        ],
        response_format: { type: 'json_object' },
      });
      return NextResponse.json(JSON.parse(response.choices[0].message.content || '{}'));
    }

    // --- MODE: IEP SHAPESHIFTER ---
    if (type === 'iep') {
      const iepPrompt = `You are an Elite Teacher Mentor. Create a custom micro-scaffold accommodation for a specific student with this profile: "${userMessage}". Grade: ${config.grade}, Subject: ${config.subject}, Time: ${config.minutes}m. Return ONLY a JSON object with a single string key "html". The value must be a fully styled HTML document using inline CSS. Make it beautiful, highly tailored, and ready to print.`;
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: iepPrompt },
          { role: 'user', content: lessonText },
        ],
        response_format: { type: 'json_object' },
      });
      return NextResponse.json(JSON.parse(response.choices[0].message.content || '{}'));
    }

    // --- MODE: CHAT ---
    if (type === 'chat') {
      const systemContent = `You are a Mentor Coach having a one-on-one TEXT CHAT with a teacher.
      TEACHER SETTINGS: Grade Level: ${config?.grade || 'General'}, Subject: ${config?.subject || 'General'}, Learner Profile: ${config?.profile || 'General'}, Class Time: ${config?.minutes || 45} minutes
      LESSON CONTEXT (First 500 chars): "${(lessonText || '').substring(0, 500)}"
      CURRENT FOCUS CARD: Category: ${lensContext?.name || 'General'}, Theory: ${lensContext?.theory || 'General principles'}, Feedback: ${lensContext?.lessonFeedback || 'N/A'}
      STRICT RULES: Talk naturally, warmly, concisely. Use HTML with <br><br> for spacing and inline CSS for color-coded headings. Reference their specific lesson. NO MARKDOWN. End with a brief question.`;
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemContent },
          ...(chatHistory || []),
          { role: 'user', content: userMessage || '' },
        ],
      });
      return NextResponse.json({ reply: response.choices[0].message.content?.replace(/[*#]/g, '') });
    }

    // --- MODE: ITERATIVE INIT (overhauled) ---
    if (type === 'iterative-init') {
      const initPrompt = `You are an Elite Teacher Mentor performing a Google Docs-style iterative review of a lesson plan.

Provide EXACTLY 5 focused feedbacks targeting these specific high-impact pedagogical categories:
1. Scaffolding — Vygotsky's Zone of Proximal Development
2. Differentiation — Tomlinson's Universal Design for Learning
3. Culturally Responsive Teaching — Gloria Ladson-Billings
4. Engagement — Fredricks' Behavioral/Cognitive/Emotional Engagement Framework
5. Objectives — Bloom's Taxonomy (Anderson & Krathwohl revision)

CRITICAL RULES:
- "quote": An EXACT verbatim substring copied character-for-character from the lesson text. MAXIMUM 20 words. Target a single sentence or short phrase — NOT an entire paragraph. This must be findable via exact string search.
- "revision": A DIRECT DROP-IN REPLACEMENT for the quote. Same approximate length and writing style as the original. Pedagogically improved. Must read naturally in context as a seamless replacement.
- "priority": "HIGH" if this is a fundamental pedagogical gap, "MEDIUM" if it is a meaningful enhancement.
- "category": Exactly one of: "Scaffolding", "Differentiation", "Culturally Responsive Teaching", "Engagement", "Objectives"
- Spread feedbacks across DIFFERENT sections of the lesson — beginning, middle, and end. Do NOT cluster all feedbacks in one section.
- "theory": The core principle (1 sentence max).
- "pioneer": The pioneer's full name.
- "pedagogy": Why this is pedagogically important (2 sentences max).
- "alignment": How improving this aligns with the rest of the lesson (1 sentence).
- "id": A unique string like "fb_1", "fb_2", etc.

Return ONLY JSON: { "feedbacks": [ { "id", "category", "priority", "quote", "theory", "pioneer", "pedagogy", "alignment", "revision" } ] }`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: initPrompt },
          { role: 'user', content: lessonText },
        ],
        response_format: { type: 'json_object' },
      });
      return NextResponse.json(JSON.parse(response.choices[0].message.content || '{}'));
    }

    // --- MODE: ITERATIVE RESPOND (updated to preserve new fields) ---
    if (type === 'iterative-respond') {
      const fb = body.fb;
      const respPrompt = `The teacher responded to your feedback about the quote: "${fb.quote}".
Teacher's response: "${userMessage}"
Update your feedback iteratively. Keep the same JSON structure including the category "${fb.category}" and priority field.
The "quote" must remain an EXACT substring from the lesson (max 20 words). The "revision" must be a direct drop-in replacement of the same approximate length.
Return ONLY JSON: { "feedback": { "id": "${fb.id}", "category": "${fb.category}", "priority": "${fb.priority || 'MEDIUM'}", "quote": "...", "theory": "...", "pioneer": "...", "pedagogy": "...", "alignment": "...", "revision": "..." } }`;
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: respPrompt },
          { role: 'user', content: lessonText },
        ],
        response_format: { type: 'json_object' },
      });
      return NextResponse.json(JSON.parse(response.choices[0].message.content || '{}'));
    }

    // --- MODE: ITERATIVE REANALYZE (new) ---
    if (type === 'iterative-reanalyze') {
      const { category } = body;
      const reanalyzePrompt = `You are an Elite Teacher Mentor. The teacher has just revised their lesson. Re-analyze ONLY the "${category}" dimension of the updated lesson.

Find the best remaining improvement opportunity for "${category}" and return exactly 1 updated feedback.

CRITICAL RULES:
- "quote": An EXACT verbatim substring from the lesson text. MAXIMUM 20 words. A specific sentence or phrase — not a paragraph.
- "revision": A direct drop-in replacement. Same length and style as original, pedagogically improved.
- "priority": "HIGH" or "MEDIUM"
- "category": "${category}"

Return ONLY JSON: { "feedback": { "id", "category": "${category}", "priority", "quote", "theory", "pioneer", "pedagogy", "alignment", "revision" } }`;
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: reanalyzePrompt },
          { role: 'user', content: lessonText },
        ],
        response_format: { type: 'json_object' },
      });
      return NextResponse.json(JSON.parse(response.choices[0].message.content || '{}'));
    }

    // --- MODE: ITERATIVE SUMMARY (new) ---
    if (type === 'iterative-summary') {
      const { changelog } = body;
      const summaryPrompt = `You are an Elite Teacher Mentor. The teacher completed an iterative review session and made these improvements:

${(changelog || []).map((c: any, i: number) => `${i + 1}. [${c.category}] "${c.quote}" → "${c.revision}"`).join('\n')}

Write a warm, encouraging 3–4 sentence summary of what was improved and why these changes make the lesson stronger. Be specific, reference the actual categories changed. End with one concrete actionable next step they can take.

Return ONLY JSON: { "summary": "..." }`;
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: summaryPrompt },
          { role: 'user', content: lessonText },
        ],
        response_format: { type: 'json_object' },
      });
      return NextResponse.json(JSON.parse(response.choices[0].message.content || '{}'));
    }

    // --- MODE: MAIN ANALYSIS ---
    let reportCommand: any =
      'For Full report mode: You MUST analyze and return an array of EXACTLY 12 objects covering ALL 12 categories (Clarity, Alignment, Inclusivity, Scaffolding, Differentiation, Objectives, Assessments, Engagement, Strategies, Materials, Collaboration, Closure) without skipping a single one.';
    if (config.mode.includes('Focused'))
      reportCommand = 'For Focused report mode: Analyze ONLY the top 3 highest-priority categories for this specific lesson.';
    if (config.mode.includes('Custom'))
      reportCommand = `For Custom selection mode: Analyze EXACTLY ALL ${selectedLenses.length} of these categories: ${selectedLenses.join(', ')}. You MUST return a complete section for EVERY SINGLE ONE.`;

    const systemPrompt = `You are an Elite Teacher Mentor. Analyze the lesson for ${config.grade} ${config.subject} (${config.profile} learners).
    Tone: Strictly adopt a "${config.tone}" persona. Time: ${config.minutes}m.

    ${reportCommand}

    STRICT FORMATTING: NO markdown symbols (*, #). Use CAPITAL HEADERS.

    FOR EACH CATEGORY, you MUST provide:
    1. theory: (MAXIMUM 90 words) detailed explanation of pioneer's work.
    2. lessonFeedback: (MAXIMUM 100 words) deep, specific critique of this draft.
    3. upgrade: (MAXIMUM 100 words) extensive details on how to adapt for ${config.profile} students.
    4. example: (MAXIMUM 150 words) highly detailed move that fits the ${config.minutes}m window.
    5. quiz: 5 multiple-choice questions directly related to THIS SPECIFIC CATEGORY (question, options, correct).

    CATEGORIES TO CHOOSE FROM: Clarity, Alignment, Inclusivity, Scaffolding, Differentiation, Objectives, Assessments, Engagement, Strategies, Materials, Collaboration, Closure.

    Return JSON: { "feedback":[ { "id", "name", "pioneer", "theory", "lessonFeedback", "upgrade", "example", "quiz" } ] }`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 16000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: lessonText },
      ],
      response_format: { type: 'json_object' },
    });

    return NextResponse.json(JSON.parse(response.choices[0].message.content || '{}'));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
