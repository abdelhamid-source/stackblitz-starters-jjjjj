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
      const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', max_tokens: 3500, messages: [{ role: 'system', content: prizePrompt }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
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
      const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', max_tokens: 3000, messages: [{ role: 'system', content: ip }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
      return NextResponse.json(JSON.parse(r.choices[0].message.content || '{}'));
    }

    // --- CHAT ---
    if (type === 'chat') {
      const sc = `You are a Mentor Coach in a TEXT CHAT with a teacher. Adopt a "${config.tone}" tone — this must shape how you phrase every sentence. Grade: ${config?.grade}, Subject: ${config?.subject}, Profile: ${config?.profile}, Time: ${config?.minutes}m. Lesson (500 chars): "${(lessonText || '').substring(0, 500)}". Focus: ${lensContext?.name}, Theory: ${lensContext?.theory}. Rules: warm, natural, concise. Use HTML with <br><br> spacing and inline CSS color headings. Reference their specific lesson. NO MARKDOWN. End with a question.`;
      const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', max_tokens: 800, messages: [{ role: 'system', content: sc }, ...(chatHistory || []), { role: 'user', content: userMessage || '' }] });
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
- "feedback": THIS IS THE MOST IMPORTANT FIELD. Write a THOROUGH, DEEPLY ANALYTICAL critique of this specific activity (4–6 sentences minimum). You must: (1) Name the specific pedagogical weakness and explain WHY it is a weakness for ${config.profile} learners at Grade ${config.grade} in ${config.subject}. (2) Reference a relevant educational theory or researcher by name to ground your critique. (3) Explain the specific impact this weakness has on student learning outcomes in a ${config.minutes}-minute class. (4) Identify what is missing or underdeveloped. Do NOT be vague or generic — be precise, rigorous, and specific to this exact lesson and this exact activity.
- "revision": A RICH, DETAILED, PEDAGOGICALLY ELEVATED rewrite of the quoted section. This is NOT just a cosmetic fix — it must be a meaningfully stronger version that directly addresses the weaknesses named in your feedback. Write it in the same voice and style as the teacher's original lesson but make it significantly better. Length should match or slightly exceed the original quote. It must be immediately usable by the teacher as a direct replacement — concrete, specific, and fully appropriate for Grade ${config.grade} ${config.subject} ${config.profile} students in ${config.minutes} minutes.
- "priority": "HIGH" if this activity has a fundamental pedagogical flaw that directly hurts learning, "MEDIUM" if it is a meaningful but non-critical refinement

CRITICAL RULES:
- ONLY include real sections with real exact verbatim quotes from the lesson text
- Spread feedback across DIFFERENT parts of the lesson — beginning, middle, and end
- Every single field must be specific to Grade ${config.grade}, Subject ${config.subject}, ${config.profile} learners, ${config.minutes}-minute class
- NEVER write generic feedback that could apply to any lesson — it must be specific to THIS lesson

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
- "quote": if hasSection TRUE → EXACT verbatim substring from the lesson, max 25 words, copied character-for-character, findable via exact string search. If hasSection FALSE → empty string "".
- "currentLevel": if hasSection TRUE → a DETAILED honest assessment of the current quality (3–4 sentences). Explain specifically what the teacher IS doing, what level of the framework they're reaching, and exactly where it falls short of exceeded expectations for Grade ${config.grade} ${config.subject} ${config.profile} learners.
- "revision": THIS IS THE MOST IMPORTANT FIELD. Write a RICH, THOROUGH, RESEARCH-BACKED revision or addition (minimum 5–8 sentences or a full instructional paragraph). If hasSection TRUE → rewrite the quoted section to TRULY EXCEED EXPECTATIONS, including specific strategies, techniques, and concrete classroom moves appropriate for Grade ${config.grade} ${config.subject} ${config.profile} in ${config.minutes} minutes. Name specific instructional strategies (e.g., "Think-Pair-Share," "tiered tasks," "culturally relevant anchor texts") and explain how they address the framework at the highest level. If hasSection FALSE → write a complete, polished, ready-to-insert instructional section that the teacher can drop directly into their lesson. Write it in the same voice and style as the teacher's original lesson. Include specific classroom directions, materials if needed, timing, and student-facing language where appropriate. It must be rich enough to genuinely elevate the lesson to EXCEEDED EXPECTATIONS.
- "addWhere": if hasSection FALSE → specify exactly where in the lesson to insert this (e.g., "Insert after the Direct Instruction section, before Guided Practice" or "Add as the final 5 minutes of the Closure activity")

ALL content must be calibrated with specificity for: Grade ${config.grade}, Subject ${config.subject}, ${config.profile} learners, ${config.minutes}-minute class. NEVER write generic guidance — every sentence must be specific to this lesson and this context.

Return ONLY JSON: { "guide": [ { "category", "pioneer", "hasSection", "quote", "currentLevel", "revision", "addWhere" } ] }`;

      const r = await openai.chat.completions.create({ model: 'gpt-4o', max_tokens: 7000, messages: [{ role: 'system', content: prompt }, { role: 'user', content: lessonText }], response_format: { type: 'json_object' } });
      return NextResponse.json(JSON.parse(r.choices[0].message.content || '{}'));
    }

    // --- ITERATIVE RESPOND ---
    if (type === 'iterative-respond') {
      const { item, sectionType } = body;
      let prompt = '';
      if (sectionType === 'activity') {
        prompt = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone. The teacher responded to your feedback on the "${item.sectionName}" section.
Original quote: "${item.quote}"
Teacher's response: "${userMessage}"
Grade: ${config.grade}, Subject: ${config.subject}, Profile: ${config.profile}, ${config.minutes}m.

Update your feedback and revision to reflect and directly address the teacher's response. Your updated "feedback" must be THOROUGH (4–6 sentences) — name the specific pedagogical issue, reference an educational theory or researcher, explain the impact on ${config.profile} learners at Grade ${config.grade}. Your updated "revision" must be a RICH, DETAILED, immediately usable drop-in replacement that directly addresses both the original weakness AND the teacher's specific concern. Quote must be EXACT verbatim substring (max 25 words).
Return ONLY JSON: { "feedback": { "id": "${item.id}", "sectionName": "${item.sectionName}", "quote": "...", "feedback": "...", "revision": "...", "priority": "${item.priority || 'MEDIUM'}", "notFound": false } }`;
      } else {
        prompt = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone. The teacher responded to your "${item.category}" exceed-expectations guidance.
Teacher's response: "${userMessage}"
Grade: ${config.grade}, Subject: ${config.subject}, Profile: ${config.profile}, ${config.minutes}m.

Update your guidance to directly address their response. Your "currentLevel" must be DETAILED (3–4 sentences) if hasSection is true. Your "revision" must be RICH and THOROUGH (5–8 sentences minimum) — specific strategies, concrete classroom moves, appropriate for Grade ${config.grade} ${config.subject} ${config.profile} in ${config.minutes} minutes. hasSection stays ${item.hasSection}. If true, quote must be EXACT substring max 25 words.
Return ONLY JSON: { "feedback": { "category": "${item.category}", "pioneer": "${item.pioneer}", "hasSection": ${item.hasSection}, "quote": "${item.quote || ''}", "currentLevel": "...", "revision": "...", "addWhere": "${item.addWhere || ''}" } }`;
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

Find the best remaining improvement opportunity for this section. Your "feedback" must be THOROUGH (4–6 sentences) — name the specific pedagogical weakness, reference an educational theory or researcher, explain the direct impact on ${config.profile} learners at Grade ${config.grade} in ${config.subject}. Your "revision" must be a RICH, DETAILED, immediately usable drop-in replacement — specific, concrete, and fully appropriate for Grade ${config.grade} ${config.subject} ${config.profile} in ${config.minutes} minutes. Quote must be EXACT verbatim substring max 25 words.
Return ONLY JSON: { "feedback": { "id": "act_r", "sectionName": "${sectionName}", "quote": "...", "feedback": "...", "revision": "...", "priority": "...", "notFound": false } }`;
      } else {
        prompt = `You are an Elite Teacher Mentor. Adopt a "${config.tone}" tone. Re-analyze the "${category}" framework in this updated lesson. Grade: ${config.grade}, Subject: ${config.subject}, Profile: ${config.profile}, ${config.minutes}m.

Provide fresh, deeply detailed exceed-expectations guidance. Your "currentLevel" must be a DETAILED honest assessment (3–4 sentences) if hasSection is true. Your "revision" must be RICH and THOROUGH (5–8 sentences minimum) with specific named strategies, concrete classroom moves, and student-facing language appropriate for Grade ${config.grade} ${config.subject} ${config.profile} in ${config.minutes} minutes. If hasSection true, quote must be EXACT substring max 25 words.
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
Write a warm, encouraging 3–4 sentence summary in a "${config.tone}" voice explaining what improved and why it strengthens the lesson for ${config.grade} ${config.profile} students in ${config.minutes} minutes. Be specific. End with one concrete next step appropriate for this class.
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
