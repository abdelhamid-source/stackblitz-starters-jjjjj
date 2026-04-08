import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { lessonText, config, selectedLenses, type, chatHistory, userMessage, lensContext } = body;

    // --- INPUT VALIDATION ---
    if (type && typeof type !== 'string') return NextResponse.json({ error: 'Invalid request type.' }, { status: 400 });
    if (!config) return NextResponse.json({ error: 'Missing config.' }, { status: 400 });

    const textRequiredTypes = ['prize','materializer','gamifier','iep','chat','iterative-init-activities','iterative-init-exceed','iterative-respond','iterative-reanalyze','iterative-summary','iterative-gap'];
    if (type && textRequiredTypes.includes(type) && (!lessonText || typeof lessonText !== 'string' || lessonText.trim().length === 0)) {
      return NextResponse.json({ error: 'Lesson text is required.' }, { status: 400 });
    }
    if (!type && (!lessonText || typeof lessonText !== 'string' || lessonText.trim().length === 0)) {
      return NextResponse.json({ error: 'Lesson text is required.' }, { status: 400 });
    }
    if (lessonText && lessonText.length > 50000) {
      return NextResponse.json({ error: 'Lesson text is too long. Please trim it to under 50,000 characters.' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY ?? '';
    if (!apiKey) return NextResponse.json({ error: 'API key not configured.' }, { status: 401 });
    const openai = new OpenAI({ apiKey });

    // --- PRIZE ---
    if (type === 'prize') {
      const prizePrompt = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone throughout — this must shape your vocabulary, phrasing, and attitude in every section. Transform the following lesson into an elite-level lesson plan. Grade: ${config.grade}, Subject: ${config.subject}, Learner Profile: ${config.profile}, Time: ${config.minutes}m. Return ONLY a JSON object with EXACTLY these string keys: "Lesson Title", "Subject", "Grade Level", "Unit", "Section", "Objectives", "Materials Needed", "Anticipatory Set/Hook", "Direct Instruction", "Guided Practice", "Independent Practice", "Game Review", "Closure/Homework", "Assessment", "Differentiation". Every section must be written for ${config.profile} learners in a ${config.grade} ${config.subject} class. State allocated time at the start of each instructional phase. All phases must sum to exactly ${config.minutes}m.`;
      const r = await openai.chat.completions.create({ model: 'gpt-4o', max_tokens: 3500, messages: [{ role: 'system', content: prizePrompt }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
      return NextResponse.json(JSON.parse(r.choices[0].message.content || '{}'));
    }

    // --- MATERIALIZER ---
    if (type === 'materializer') {
      const matPrompt = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone throughout. Create an EXTREMELY LONG, highly creative printable student Worksheet tailored specifically for ${config.profile} learners. Grade: ${config.grade}, Subject: ${config.subject}, Time: ${config.minutes}m.
Every activity, instruction, and item must be calibrated for ${config.grade} ${config.subject} ${config.profile} students within a ${config.minutes}-minute class.
TEACHER INSTRUCTIONS: "${userMessage || 'Create a comprehensive standard worksheet.'}" — STRICTLY FOLLOW THESE.
Return ONLY JSON: { "html": string, "requiresImage": boolean, "imagePrompt": string }.
HTML: fully styled inline CSS, readable fonts, generous spacing. Tables for grids. MINIMUM 7 items per activity. Put "{{IMAGE_PLACEHOLDER}}" where images go.`;
      const r = await openai.chat.completions.create({ model: 'gpt-4o', max_tokens: 6000, messages: [{ role: 'system', content: matPrompt }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
      let obj = JSON.parse(r.choices[0].message.content || '{}');
      // Fix #11: Guard obj.html before calling .replace() on it.
      // If the AI returns a JSON object without an 'html' key (malformed response),
      // calling .replace() on undefined throws a TypeError that crashes the handler.
      if (!obj.html) obj.html = '';
      if (obj.requiresImage && obj.imagePrompt) {
        try {
          const fp = obj.imagePrompt + ' STRICT: 1 object. Black-and-white clipart line-art, white background. No humans/faces/eyes.';
          const [a, b, c] = await Promise.all([
            openai.images.generate({ model: 'dall-e-3', prompt: fp + ' (1)', n: 1, size: '1024x1024', response_format: 'b64_json' }),
            openai.images.generate({ model: 'dall-e-3', prompt: fp + ' (2)', n: 1, size: '1024x1024', response_format: 'b64_json' }),
            openai.images.generate({ model: 'dall-e-3', prompt: fp + ' (3)', n: 1, size: '1024x1024', response_format: 'b64_json' }),
          ]);
          const b64s = [a.data[0].b64_json || '', b.data[0].b64_json || '', c.data[0].b64_json || ''];
          if (b64s.every(x => x)) {
            const tag = `<div style="text-align:center;margin:30px 0;">${b64s.map(x => `<img src="data:image/png;base64,${x}" style="width:200px;height:200px;margin:15px;display:inline-block;border:2px dashed #000;padding:10px;" />`).join('')}</div>`;
            obj.html = obj.html.replace('{{IMAGE_PLACEHOLDER}}', tag);
          } else obj.html = obj.html.replace('{{IMAGE_PLACEHOLDER}}', '');
        } catch { obj.html = obj.html.replace('{{IMAGE_PLACEHOLDER}}', ''); }
      } else if (obj.html) obj.html = obj.html.replace('{{IMAGE_PLACEHOLDER}}', '');
      return NextResponse.json(obj);
    }

    // --- GAMIFIER ---
    if (type === 'gamifier') {
      const gp = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone. Create a 10-question MCQ trivia game perfectly calibrated for Grade ${config.grade} ${config.subject} ${config.profile} learners in a ${config.minutes}-minute class. Questions must match the vocabulary, complexity, and content expectations for ${config.grade} ${config.profile} students. Return ONLY JSON: { "csv": string }. CSV header: "Question,Answer 1,Answer 2,Answer 3,Answer 4,Time limit (sec),Correct answer(s)". Time limit 20. Correct answer 1-4. Output all 10 questions completely — do NOT truncate.`;
      const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', max_tokens: 1500, messages: [{ role: 'system', content: gp }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
      return NextResponse.json(JSON.parse(r.choices[0].message.content || '{}'));
    }

    // --- IEP ---
    if (type === 'iep') {
      const ip = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone. Create a custom micro-scaffold accommodation for this specific student: "${userMessage}". This scaffold is for use in a Grade ${config.grade} ${config.subject} class of ${config.profile} learners within a ${config.minutes}-minute period. The scaffold must account for both the individual student's needs AND the broader class context (${config.profile}). Return ONLY JSON: { "html": "fully styled HTML ready to print" }.`;
      const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', max_tokens: 3000, messages: [{ role: 'system', content: ip }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
      return NextResponse.json(JSON.parse(r.choices[0].message.content || '{}'));
    }

    // --- CHAT ---
    // FIX #8: The client sends:
    //   - chatHistory: the conversation BEFORE the new user message (historySnapshot)
    //   - userMessage: the new user message separately
    //
    // The previous version spread chatHistory directly, which already contained the new
    // user message at the end (because the client pushed it to state before snapshotting).
    // That caused the user message to appear twice in the OpenAI context.
    //
    // The corrected client now sends historySnapshot (WITHOUT the new message) + userMessage
    // separately. So this route must explicitly append { role: 'user', content: userMessage }
    // after spreading chatHistory to complete the message list correctly.
    // Without this append, the AI receives the prior context but the actual question is missing.
    if (type === 'chat') {
      if (!userMessage || typeof userMessage !== 'string' || !userMessage.trim()) {
        return NextResponse.json({ error: 'Chat message is required.' }, { status: 400 });
      }
      const sc = `You are a Mentor Coach in a TEXT CHAT with a teacher. Adopt a "${config.tone}" tone — this must shape how you phrase every sentence. Grade: ${config?.grade}, Subject: ${config?.subject}, Profile: ${config?.profile}, Time: ${config?.minutes}m. Lesson (500 chars): "${(lessonText || '').substring(0, 500)}". Focus: ${lensContext?.name}, Theory: ${lensContext?.theory}. Rules: warm, natural, concise. Use HTML with <br><br> spacing and inline CSS color headings. Reference their specific lesson. NO MARKDOWN. End with a question.`;

      // Fix #10: Sanitize chatHistory before spreading to OpenAI.
      // Malformed or unexpected items from the client (missing role/content, wrong role values)
      // cause an OpenAI 400 error that surfaces as a generic "something went wrong" to the user.
      // Filter to only well-formed {role: 'user'|'assistant', content: string} objects.
      const validHistory = (chatHistory || []).filter(
        (m: any) =>
          m &&
          typeof m === 'object' &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string' &&
          m.content.trim().length > 0
      );
      const r = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 800,
        messages: [
          { role: 'system', content: sc },
          // Spread sanitized prior history, then append the new user message.
          // This ensures the message appears exactly once in the correct position.
          ...validHistory,
          { role: 'user', content: userMessage },
        ]
      });
      return NextResponse.json({ reply: r.choices[0].message.content?.replace(/[*#]/g, '') });
    }

    // --- ITERATIVE SECTION 1: Activity & Section Feedback ---
    if (type === 'iterative-init-activities') {
      const prompt = `You are an Elite Teacher Mentor — the best in the world — conducting a rigorous, deeply detailed iterative review of a lesson plan. Adopt a "${config.tone}" tone throughout every field.

LESSON CONTEXT: Grade ${config.grade}, Subject: ${config.subject}, Learner Profile: ${config.profile}, Class Time: ${config.minutes} minutes.

Identify between 4 and 6 distinct ACTIVITIES or LESSON SECTIONS explicitly present in this lesson (e.g., hook, warm-up, direct instruction, guided practice, independent practice, group activity, exit ticket, closure, discussion, etc.).

For EACH activity/section return ALL of the following fields with MAXIMUM DEPTH AND DETAIL:

- "id": unique string like "act_1"
- "sectionName": the name/label of this activity as it appears or can be inferred from the lesson
- "quote": EXACT verbatim substring copied character-for-character from the lesson text representing this section. MAX 25 words. Must be findable via exact string search.
- "notFound": false — only include sections that genuinely exist with a real exact quote
- "feedback": THIS IS THE MOST IMPORTANT FIELD. Write a THOROUGH, DEEPLY ANALYTICAL critique of this specific activity (4–6 sentences minimum). You must: (1) Name the specific pedagogical weakness and explain WHY it is a weakness for ${config.profile} learners at Grade ${config.grade} in ${config.subject}. (2) Reference a relevant educational theory or researcher by name to ground your critique. (3) Explain the specific impact this weakness has on student learning outcomes in a ${config.minutes}-minute class. (4) Identify what is missing or underdeveloped. Do NOT be vague or generic.
- "revision": A RICH, DETAILED, PEDAGOGICALLY ELEVATED rewrite of the quoted section. Length should match or slightly exceed the original quote. Must be immediately usable as a direct replacement for Grade ${config.grade} ${config.subject} ${config.profile} students in ${config.minutes} minutes.
- "priority": "HIGH" if this activity has a fundamental pedagogical flaw, "MEDIUM" if it is a meaningful refinement

CRITICAL RULES:
- ONLY include real sections with real exact verbatim quotes from the lesson text
- Spread feedback across DIFFERENT parts of the lesson — beginning, middle, and end
- Every field must be specific to Grade ${config.grade}, Subject ${config.subject}, ${config.profile} learners, ${config.minutes}-minute class

Return ONLY JSON: { "feedbacks": [ { "id", "sectionName", "quote", "notFound", "feedback", "revision", "priority" } ] }`;

      const r = await openai.chat.completions.create({ model: 'gpt-4o', max_tokens: 7000, messages: [{ role: 'system', content: prompt }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
      return NextResponse.json(JSON.parse(r.choices[0].message.content || '{}'));
    }

    // --- ITERATIVE SECTION 2: Exceed Expectations Guide ---
    if (type === 'iterative-init-exceed') {
      const prompt = `You are an Elite Teacher Mentor — the best in the world — building a deeply detailed, research-grounded "Exceed Expectations" guide for a lesson. Adopt a "${config.tone}" tone throughout every field.

LESSON CONTEXT: Grade ${config.grade}, Subject: ${config.subject}, Learner Profile: ${config.profile}, Class Time: ${config.minutes} minutes.

Evaluate this lesson against 5 pedagogical frameworks and provide rich, expert-level guidance to reach TRULY EXCEEDED EXPECTATIONS for each:
1. Scaffolding (Vygotsky — Zone of Proximal Development)
2. Differentiation (Tomlinson — Universal Design for Learning)
3. Culturally Responsive Teaching (Gloria Ladson-Billings)
4. Engagement (Fredricks — Behavioral/Cognitive/Emotional Engagement Framework)
5. Objectives (Bloom's Taxonomy — Anderson & Krathwohl revision)

For EACH category return ALL of the following fields with MAXIMUM DEPTH AND DETAIL:

- "category": exact name from list above
- "pioneer": pioneer's full name
- "hasSection": boolean — does this lesson have meaningful content addressing this framework?
- "quote": if hasSection TRUE → EXACT verbatim substring from the lesson text, max 25 words, copied character-for-character. If hasSection FALSE → empty string "".
- "currentLevel": if hasSection TRUE → a DETAILED honest assessment of the current quality (3–4 sentences).
- "revision": RICH, THOROUGH revision or addition (minimum 5–8 sentences). If hasSection TRUE → rewrite quoted section to TRULY EXCEED EXPECTATIONS with specific named strategies for Grade ${config.grade} ${config.subject} ${config.profile} in ${config.minutes} minutes. If hasSection FALSE → complete ready-to-insert instructional section in the same voice as the teacher's lesson.
- "addWhere": if hasSection FALSE → exactly where in the lesson to insert this.

Return ONLY JSON: { "guide": [ { "category", "pioneer", "hasSection", "quote", "currentLevel", "revision", "addWhere" } ] }`;

      const r = await openai.chat.completions.create({ model: 'gpt-4o', max_tokens: 7000, messages: [{ role: 'system', content: prompt }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
      return NextResponse.json(JSON.parse(r.choices[0].message.content || '{}'));
    }

    // --- ITERATIVE RESPOND ---
    if (type === 'iterative-respond') {
      const { item, sectionType } = body;
      if (!item) return NextResponse.json({ error: 'Missing item.' }, { status: 400 });

      // Fix #9: Sanitize all item fields before injecting into template strings.
      // AI-returned values (quote, pioneer, category, etc.) can contain backticks or
      // ${...} sequences that corrupt the prompt when interpolated into a template literal.
      const safeStr = (v: any): string => String(v || '').replace(/`/g, "'").replace(/\$\{/g, '${');

      let prompt = '';
      if (sectionType === 'activity') {
        prompt = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone. The teacher responded to your feedback on the "${safeStr(item.sectionName)}" section.
Original quote: "${safeStr(item.quote)}"
Teacher's response: "${userMessage}"
Grade: ${config.grade}, Subject: ${config.subject}, Profile: ${config.profile}, ${config.minutes}m.
Update your feedback and revision to reflect and directly address the teacher's response. "feedback" must be THOROUGH (4–6 sentences). "revision" must be RICH, DETAILED, immediately usable. Quote must be EXACT verbatim substring (max 25 words).
Return ONLY JSON: { "feedback": { "id": "${safeStr(item.id)}", "sectionName": "${safeStr(item.sectionName)}", "quote": "...", "feedback": "...", "revision": "...", "priority": "${safeStr(item.priority || 'MEDIUM')}", "notFound": false } }`;
      } else {
        prompt = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone. The teacher responded to your "${safeStr(item.category)}" exceed-expectations guidance.
Teacher's response: "${userMessage}"
Grade: ${config.grade}, Subject: ${config.subject}, Profile: ${config.profile}, ${config.minutes}m.
Update your guidance. "currentLevel" must be DETAILED (3–4 sentences) if hasSection true. "revision" must be RICH and THOROUGH (5–8 sentences minimum). hasSection stays ${item.hasSection}. If true, quote must be EXACT substring max 25 words.
Return ONLY JSON: { "feedback": { "category": "${safeStr(item.category)}", "pioneer": "${safeStr(item.pioneer)}", "hasSection": ${item.hasSection}, "quote": "${safeStr(item.quote || '')}", "currentLevel": "...", "revision": "...", "addWhere": "${safeStr(item.addWhere || '')}" } }`;
      }
      const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', max_tokens: 1800, messages: [{ role: 'system', content: prompt }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
      return NextResponse.json(JSON.parse(r.choices[0].message.content || '{}'));
    }

    // --- ITERATIVE REANALYZE ---
    if (type === 'iterative-reanalyze') {
      const { sectionType, sectionName, category } = body;
      let prompt = '';
      if (sectionType === 'activity') {
        prompt = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone. Re-analyze the "${sectionName}" section in this updated lesson. Grade: ${config.grade}, Subject: ${config.subject}, Profile: ${config.profile}, ${config.minutes}m.
Find the best remaining improvement opportunity. "feedback" must be THOROUGH (4–6 sentences). "revision" must be RICH, DETAILED, immediately usable for Grade ${config.grade} ${config.subject} ${config.profile} in ${config.minutes} minutes. Quote must be EXACT verbatim substring max 25 words.
Return ONLY JSON: { "feedback": { "id": "act_r", "sectionName": "${sectionName}", "quote": "...", "feedback": "...", "revision": "...", "priority": "...", "notFound": false } }`;
      } else {
        prompt = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone. Re-analyze the "${category}" framework in this updated lesson. Grade: ${config.grade}, Subject: ${config.subject}, Profile: ${config.profile}, ${config.minutes}m.
"currentLevel" must be a DETAILED honest assessment (3–4 sentences) if hasSection true. "revision" must be RICH and THOROUGH (5–8 sentences minimum) with specific named strategies for Grade ${config.grade} ${config.subject} ${config.profile} in ${config.minutes} minutes. If hasSection true, quote must be EXACT substring max 25 words.
Return ONLY JSON: { "feedback": { "category": "${category}", "pioneer": "...", "hasSection": ..., "quote": "...", "currentLevel": "...", "revision": "...", "addWhere": "..." } }`;
      }
      const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', max_tokens: 1800, messages: [{ role: 'system', content: prompt }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
      return NextResponse.json(JSON.parse(r.choices[0].message.content || '{}'));
    }

    // --- ITERATIVE SUMMARY ---
    if (type === 'iterative-summary') {
      const { changelog } = body;
      const sp = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone. The teacher made these improvements to their Grade ${config.grade} ${config.subject} ${config.profile} lesson (${config.minutes}-minute class):
${(changelog || []).map((c: any, i: number) => `${i + 1}. [${c.sectionName}] "${c.isAddition ? '(new addition)' : c.quote}" → "${c.revision}"`).join('\n')}
Write a warm, encouraging 3–4 sentence summary in a "${config.tone}" voice explaining what improved and why it strengthens the lesson for ${config.grade} ${config.profile} students in ${config.minutes} minutes. Be specific. End with one concrete next step.
Return ONLY JSON: { "summary": "..." }`;
      const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', max_tokens: 600, messages: [{ role: 'system', content: sp }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
      return NextResponse.json(JSON.parse(r.choices[0].message.content || '{}'));
    }

    // --- ITERATIVE GAP DETECTOR ---
    if (type === 'iterative-gap') {
      const gp = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone. Review this revised lesson for Grade ${config.grade}, Subject: ${config.subject}, Profile: ${config.profile}, ${config.minutes} minutes. Check if it NOW adequately addresses: 1. Scaffolding, 2. Differentiation, 3. Culturally Responsive Teaching, 4. Engagement, 5. Objectives.
For each: "category", "adequatelyAddressed" (boolean), "note" (if not adequately addressed — one concrete sentence on what is still missing, written for Grade ${config.grade} ${config.subject} ${config.profile} in ${config.minutes} minutes).
Return ONLY JSON: { "gaps": [ { "category", "adequatelyAddressed", "note" } ] }`;
      const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', max_tokens: 600, messages: [{ role: 'system', content: gp }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
      return NextResponse.json(JSON.parse(r.choices[0].message.content || '{}'));
    }

    // --- MAIN ANALYSIS (Full / Focused / Custom) ---
    // Fix #12: Explicit unknown-type guard. If a type string was sent that matched none
    // of the handlers above, it would silently fall through to here and attempt a full
    // 12-category report, which is incorrect and wasteful. Return a clear 400 instead.
    const knownTypes = ['prize','materializer','gamifier','iep','chat','iterative-init-activities','iterative-init-exceed','iterative-respond','iterative-reanalyze','iterative-summary','iterative-gap'];
    if (type && !knownTypes.includes(type)) {
      return NextResponse.json({ error: `Unknown request type: ${type}` }, { status: 400 });
    }
    // includes('Custom') would match any hypothetical future mode containing "Custom",
    // and includes('Focused') is similarly fragile. Exact === comparisons are unambiguous
    // and match exactly the mode strings used in the client dropdown.
    if (config.mode === 'Custom selection' && (!selectedLenses || selectedLenses.length === 0)) {
      return NextResponse.json({ error: 'No categories selected for custom mode.' }, { status: 400 });
    }

    let reportCommand = 'Full report: return EXACTLY 12 objects for ALL 12 categories (Clarity, Alignment, Inclusivity, Scaffolding, Differentiation, Objectives, Assessments, Engagement, Strategies, Materials, Collaboration, Closure).';
    if (config.mode === 'Focused report') reportCommand = 'Focused report: Analyze ONLY the top 3 highest-priority categories.';
    if (config.mode === 'Custom selection') reportCommand = `Custom selection: Analyze EXACTLY these ${selectedLenses.length} categories: ${selectedLenses.join(', ')}.`;

    const systemPrompt = `You are an Elite Teacher Mentor. Analyze lesson for ${config.grade} ${config.subject} (${config.profile} learners). Tone: "${config.tone}". Time: ${config.minutes}m.
${reportCommand}
For each category: theory (90w), lessonFeedback (100w), upgrade (100w), example (150w), quiz (5 MCQs: question, options, correct).
CATEGORIES: Clarity, Alignment, Inclusivity, Scaffolding, Differentiation, Objectives, Assessments, Engagement, Strategies, Materials, Collaboration, Closure.
Return JSON: { "feedback":[ { "id", "name", "pioneer", "theory", "lessonFeedback", "upgrade", "example", "quiz" } ] }`;

    const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', max_tokens: 16000, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
    return NextResponse.json(JSON.parse(r.choices[0].message.content || '{}'));

  } catch (error: any) {
    console.error('[API Error]', error);
    const isKnown = error?.message?.includes('JSON') || error?.message?.includes('token') || error?.message?.includes('rate limit');
    const safeMessage = isKnown
      ? 'Generation failed. Try again or use a shorter lesson.'
      : 'Something went wrong. Please try again.';
    return NextResponse.json({ error: safeMessage }, { status: 500 });
  }
}
