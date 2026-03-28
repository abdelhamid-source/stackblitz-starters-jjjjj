import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { lessonText, config, selectedLenses, type, chatHistory, userMessage, lensContext } = body;

    const apiKey = process.env.OPENAI_API_KEY ?? '';
    if (!apiKey) return NextResponse.json({ error: 'API Key Missing' }, { status: 401 });
    const openai = new OpenAI({ apiKey });

    // --- PRIZE ---
    if (type === 'prize') {
      const prizePrompt = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone throughout — this must shape your vocabulary, phrasing, and attitude in every section. Transform the following lesson into an elite-level lesson plan. Grade: ${config.grade}, Subject: ${config.subject}, Learner Profile: ${config.profile}, Time: ${config.minutes}m. Return ONLY a JSON object with EXACTLY these string keys: "Lesson Title", "Subject", "Grade Level", "Unit", "Section", "Objectives", "Materials Needed", "Anticipatory Set/Hook", "Direct Instruction", "Guided Practice", "Independent Practice", "Game Review", "Closure/Homework", "Assessment", "Differentiation". Every section must be written for ${config.profile} learners in a ${config.grade} ${config.subject} class. State allocated time at the start of each instructional phase. All phases must sum to exactly ${config.minutes}m.`;
      const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', max_tokens: 2000, messages: [{ role: 'system', content: prizePrompt }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
      return NextResponse.json(JSON.parse(r.choices[0].message.content || '{}'));
    }

    // --- MATERIALIZER ---
    if (type === 'materializer') {
      const matPrompt = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone throughout. Create an EXTREMELY LONG, highly creative printable student Worksheet tailored specifically for ${config.profile} learners. Grade: ${config.grade}, Subject: ${config.subject}, Time: ${config.minutes}m.
Every activity, instruction, and item must be calibrated for ${config.grade} ${config.subject} ${config.profile} students within a ${config.minutes}-minute class.
TEACHER INSTRUCTIONS: "${userMessage || 'Create a comprehensive standard worksheet.'}" — STRICTLY FOLLOW THESE.
Return ONLY JSON: { "html": string, "requiresImage": boolean, "imagePrompt": string }.
HTML: fully styled inline CSS, readable fonts, generous spacing. Tables for grids. MINIMUM 7 items per activity. Put "{{IMAGE_PLACEHOLDER}}" where images go.`;
      const r = await openai.chat.completions.create({ model: 'gpt-4o', max_tokens: 4000, messages: [{ role: 'system', content: matPrompt }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
      let obj = JSON.parse(r.choices[0].message.content || '{}');
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
      const gp = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone. Create a 10-question MCQ trivia game perfectly calibrated for Grade ${config.grade} ${config.subject} ${config.profile} learners in a ${config.minutes}-minute class. Questions must match the vocabulary, complexity, and content expectations for ${config.grade} ${config.profile} students. Return ONLY JSON: { "csv": string }. CSV header: "Question,Answer 1,Answer 2,Answer 3,Answer 4,Time limit (sec),Correct answer(s)". Time limit 20. Correct answer 1-4.`;
      const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', max_tokens: 1000, messages: [{ role: 'system', content: gp }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
      return NextResponse.json(JSON.parse(r.choices[0].message.content || '{}'));
    }

    // --- IEP ---
    if (type === 'iep') {
      const ip = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone. Create a custom micro-scaffold accommodation for this specific student: "${userMessage}". This scaffold is for use in a Grade ${config.grade} ${config.subject} class of ${config.profile} learners within a ${config.minutes}-minute period. The scaffold must account for both the individual student's needs AND the broader class context (${config.profile}). Return ONLY JSON: { "html": "fully styled HTML ready to print" }.`;
      const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', max_tokens: 2000, messages: [{ role: 'system', content: ip }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
      return NextResponse.json(JSON.parse(r.choices[0].message.content || '{}'));
    }

    // --- CHAT ---
    if (type === 'chat') {
      const sc = `You are a Mentor Coach in a TEXT CHAT with a teacher. Adopt a "${config.tone}" tone — this must shape how you phrase every sentence. Grade: ${config?.grade}, Subject: ${config?.subject}, Profile: ${config?.profile}, Time: ${config?.minutes}m. Lesson (500 chars): "${(lessonText || '').substring(0, 500)}". Focus: ${lensContext?.name}, Theory: ${lensContext?.theory}. Rules: warm, natural, concise. Use HTML with <br><br> spacing and inline CSS color headings. Reference their specific lesson. NO MARKDOWN. End with a question.`;
      const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', max_tokens: 600, messages: [{ role: 'system', content: sc }, ...(chatHistory || []), { role: 'user', content: userMessage || '' }] });
      return NextResponse.json({ reply: r.choices[0].message.content?.replace(/[*#]/g, '') });
    }

    // --- ITERATIVE SECTION 1: Activity & Section Feedback ---
    if (type === 'iterative-init-activities') {
      const prompt = `You are an Elite Teacher Mentor reviewing a lesson plan. Adopt a "${config.tone}" tone throughout all feedback and revision text.

LESSON CONTEXT: Grade ${config.grade}, Subject: ${config.subject}, Learner Profile: ${config.profile}, Class Time: ${config.minutes} minutes.

Identify between 4 and 6 distinct ACTIVITIES or LESSON SECTIONS explicitly present in this lesson (e.g., hook, warm-up, direct instruction, guided practice, independent practice, group activity, exit ticket, closure, discussion, etc.).

For EACH activity/section return:
- "id": unique string like "act_1"
- "sectionName": name/label of this activity as it appears or can be inferred from the lesson
- "quote": EXACT verbatim substring from the lesson text for this section. MAX 25 words. Must be findable via exact string search. Copy character-for-character from the text.
- "notFound": false — only include sections that genuinely exist with a real quote
- "feedback": specific critique of this activity's weaknesses for Grade ${config.grade} ${config.subject} ${config.profile} learners in ${config.minutes} minutes
- "revision": DIRECT DROP-IN REPLACEMENT for the quoted text. Same approximate length and writing style. Pedagogically stronger. Concrete and immediately usable for Grade ${config.grade} ${config.subject} ${config.profile}.
- "priority": "HIGH" if fundamentally weak, "MEDIUM" if a meaningful refinement

RULES:
- ONLY include real sections with real exact quotes from the lesson text
- Spread feedback across DIFFERENT parts of the lesson (beginning, middle, end)
- Every suggestion must fit Grade ${config.grade} ${config.subject} ${config.profile} in ${config.minutes} minutes

Return ONLY JSON: { "feedbacks": [ { "id", "sectionName", "quote", "notFound", "feedback", "revision", "priority" } ] }`;

      const r = await openai.chat.completions.create({ model: 'gpt-4o', max_tokens: 3000, messages: [{ role: 'system', content: prompt }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
      return NextResponse.json(JSON.parse(r.choices[0].message.content || '{}'));
    }

    // --- ITERATIVE SECTION 2: Exceed Expectations Guide ---
    if (type === 'iterative-init-exceed') {
      const prompt = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone throughout all feedback and revision text. Analyze this lesson for Grade ${config.grade}, Subject: ${config.subject}, Profile: ${config.profile}, ${config.minutes} minutes.

Evaluate against 5 pedagogical frameworks and provide EXCEEDED EXPECTATIONS guidance for each:
1. Scaffolding (Vygotsky — Zone of Proximal Development)
2. Differentiation (Tomlinson — Universal Design for Learning)
3. Culturally Responsive Teaching (Gloria Ladson-Billings)
4. Engagement (Fredricks — Behavioral/Cognitive/Emotional Framework)
5. Objectives (Bloom's Taxonomy — Anderson & Krathwohl)

For EACH category return:
- "category": exact name from list above
- "pioneer": pioneer's full name
- "hasSection": boolean — does the lesson have meaningful content addressing this?
- "quote": if hasSection TRUE → EXACT verbatim substring from the lesson, max 25 words, findable via exact string search. If hasSection FALSE → empty string "".
- "currentLevel": if hasSection TRUE → honest 1-sentence description of current quality
- "revision": CONCRETE text. If hasSection TRUE → drop-in replacement bringing the quote to EXCEEDED EXPECTATIONS for Grade ${config.grade} ${config.subject} ${config.profile}. If hasSection FALSE → complete ready-to-paste paragraph the teacher can add, written in the same tone and style as the lesson.
- "addWhere": if hasSection FALSE → exactly where to insert this in the lesson (e.g., "After the Direct Instruction section", "Before Closure")

All suggestions calibrated for: Grade ${config.grade}, Subject ${config.subject}, ${config.profile} learners, ${config.minutes} minutes.

Return ONLY JSON: { "guide": [ { "category", "pioneer", "hasSection", "quote", "currentLevel", "revision", "addWhere" } ] }`;

      const r = await openai.chat.completions.create({ model: 'gpt-4o', max_tokens: 3000, messages: [{ role: 'system', content: prompt }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
      return NextResponse.json(JSON.parse(r.choices[0].message.content || '{}'));
    }

    // --- ITERATIVE RESPOND ---
    if (type === 'iterative-respond') {
      const { item, sectionType } = body;
      let prompt = '';
      if (sectionType === 'activity') {
        prompt = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone. Teacher responded to feedback on "${item.sectionName}" section. Quote: "${item.quote}". Teacher says: "${userMessage}". Grade: ${config.grade}, Subject: ${config.subject}, Profile: ${config.profile}, ${config.minutes}m. Update feedback and revision to reflect their response. Quote must be EXACT substring (max 25 words). Revision must be direct drop-in replacement for Grade ${config.grade} ${config.subject} ${config.profile}.
Return ONLY JSON: { "feedback": { "id": "${item.id}", "sectionName": "${item.sectionName}", "quote": "...", "feedback": "...", "revision": "...", "priority": "${item.priority || 'MEDIUM'}", "notFound": false } }`;
      } else {
        prompt = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone. Teacher responded to "${item.category}" exceed-expectations guide. They said: "${userMessage}". Grade: ${config.grade}, Subject: ${config.subject}, Profile: ${config.profile}, ${config.minutes}m. Update guidance to reflect their response. hasSection stays ${item.hasSection}. If true, quote must be EXACT substring max 25 words. All revision text must be calibrated for Grade ${config.grade} ${config.subject} ${config.profile} in ${config.minutes} minutes.
Return ONLY JSON: { "feedback": { "category": "${item.category}", "pioneer": "${item.pioneer}", "hasSection": ${item.hasSection}, "quote": "${item.quote || ''}", "currentLevel": "...", "revision": "...", "addWhere": "${item.addWhere || ''}" } }`;
      }
      const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', max_tokens: 800, messages: [{ role: 'system', content: prompt }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
      return NextResponse.json(JSON.parse(r.choices[0].message.content || '{}'));
    }

    // --- ITERATIVE REANALYZE ---
    if (type === 'iterative-reanalyze') {
      const { sectionType, sectionName, category } = body;
      let prompt = '';
      if (sectionType === 'activity') {
        prompt = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone. Re-analyze the "${sectionName}" section in this lesson. Grade: ${config.grade}, Subject: ${config.subject}, Profile: ${config.profile}, ${config.minutes}m. Find the best remaining improvement opportunity. Quote must be EXACT verbatim substring max 25 words. Revision must be a direct drop-in replacement written for Grade ${config.grade} ${config.subject} ${config.profile} students in ${config.minutes} minutes.
Return ONLY JSON: { "feedback": { "id": "act_r", "sectionName": "${sectionName}", "quote": "...", "feedback": "...", "revision": "...", "priority": "...", "notFound": false } }`;
      } else {
        prompt = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone. Re-analyze "${category}" for Grade ${config.grade}, Subject: ${config.subject}, Profile: ${config.profile}, ${config.minutes}m. Provide updated exceed-expectations guidance. If hasSection true, quote must be EXACT substring max 25 words. All revision text calibrated for Grade ${config.grade} ${config.subject} ${config.profile} in ${config.minutes} minutes.
Return ONLY JSON: { "feedback": { "category": "${category}", "pioneer": "...", "hasSection": ..., "quote": "...", "currentLevel": "...", "revision": "...", "addWhere": "..." } }`;
      }
      const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', max_tokens: 800, messages: [{ role: 'system', content: prompt }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
      return NextResponse.json(JSON.parse(r.choices[0].message.content || '{}'));
    }

    // --- ITERATIVE SUMMARY ---
    if (type === 'iterative-summary') {
      const { changelog } = body;
      const sp = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone. The teacher made these improvements to their Grade ${config.grade} ${config.subject} ${config.profile} lesson (${config.minutes}-minute class):
${(changelog || []).map((c: any, i: number) => `${i + 1}. [${c.sectionName}] "${c.isAddition ? '(new addition)' : c.quote}" → "${c.revision}"`).join('\n')}
Write a warm, encouraging 3–4 sentence summary in a "${config.tone}" voice explaining what improved and why it strengthens the lesson for ${config.grade} ${config.profile} students in ${config.minutes} minutes. Be specific. End with one concrete next step appropriate for this class.
Return ONLY JSON: { "summary": "..." }`;
      const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', max_tokens: 400, messages: [{ role: 'system', content: sp }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
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

    // --- MAIN ANALYSIS ---
    let reportCommand = 'Full report: return EXACTLY 12 objects for ALL 12 categories (Clarity, Alignment, Inclusivity, Scaffolding, Differentiation, Objectives, Assessments, Engagement, Strategies, Materials, Collaboration, Closure).';
    if (config.mode.includes('Focused')) reportCommand = 'Focused report: Analyze ONLY the top 3 highest-priority categories.';
    if (config.mode.includes('Custom')) reportCommand = `Custom selection: Analyze EXACTLY these ${selectedLenses.length} categories: ${selectedLenses.join(', ')}.`;

    const systemPrompt = `You are an Elite Teacher Mentor. Analyze lesson for ${config.grade} ${config.subject} (${config.profile} learners). Tone: "${config.tone}". Time: ${config.minutes}m.
${reportCommand}
For each category: theory (90w), lessonFeedback (100w), upgrade (100w), example (150w), quiz (5 MCQs: question, options, correct).
CATEGORIES: Clarity, Alignment, Inclusivity, Scaffolding, Differentiation, Objectives, Assessments, Engagement, Strategies, Materials, Collaboration, Closure.
Return JSON: { "feedback":[ { "id", "name", "pioneer", "theory", "lessonFeedback", "upgrade", "example", "quiz" } ] }`;

    const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', max_tokens: 16000, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
    return NextResponse.json(JSON.parse(r.choices[0].message.content || '{}'));

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
