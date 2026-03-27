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

    // --- MODE: PRIZE (ELITE LESSON PLAN DOC) ---
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

    // --- MODE: MATERIALIZER (INSTANT HANDOUT W/ CONDITIONAL DALL-E) ---
    if (type === 'materializer') {
      const matPrompt = `You are an Elite Teacher Mentor using the absolute best, most advanced AI logic. Create an engaging, highly creative, EXTREMELY LONG and thoroughly developed printable student Worksheet/Material based exactly on this lesson. Grade: ${
        config.grade
      }, Subject: ${config.subject}, Profile: ${config.profile}, Time: ${
        config.minutes
      }m. 
      TEACHER'S CUSTOM INSTRUCTIONS: "${
        userMessage || 'Create a comprehensive standard worksheet.'
      }" -> YOU MUST STRICTLY FOLLOW THESE INSTRUCTIONS (e.g., if they ask for a gallery walk, cut-and-paste images, specific structures, you MUST build exactly that).
      Return ONLY a JSON object with three keys: "html" (string), "requiresImage" (boolean), and "imagePrompt" (string). 
      The "html" value must be a fully styled HTML document using inline CSS (e.g., modern readable fonts like 'Comic Sans MS', 'Nunito', or 'Arial', optimal font size 14pt-16pt, generous line spacing, perfectly organized formatting so students have clear, ample physical space and empty lines to write their answers). For ANY charts, quadrants, or grids, YOU MUST use proper HTML <table border="1" cellpadding="20" style="border-collapse: collapse; width: 100%; table-layout: fixed; word-wrap: break-word; min-height: 400px; text-align: left; font-size: 14pt;"> with padded <td> cells (padding: 20px; height: 150px;) so it formats perfectly, does NOT go out of frame horizontally, and provides huge writing spaces in Word. 
      Ensure EVERY single activity requested (like gallery walks, cut-outs, fill-in-the-blanks) is extensively developed with a MINIMUM OF 7 items/sentences/stations per activity. If cut-and-paste is requested, build a "Cut-Out Sheet" using CSS dashed borders. The handout MUST include a Materials section that explicitly lists ALL the materials from the elite lesson plan, plus extra ones. 
      IMPORTANT IMAGE LOGIC: You MUST set "requiresImage" to true and write a description in "imagePrompt" for a set of 3 related objects that perfectly capture the lesson's main visual activity, putting "{{IMAGE_PLACEHOLDER}}" exactly where it belongs in the HTML. Do not skip this.`;

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
            ' STRICT RULES: Create exactly 1 single distinct object. Use a simple black-and-white clipart 2D line-art style, pure snow-white background. No humans, faces, or eyes. Perfectly suited for separate cut-out worksheet items.';

          const i1 = openai.images.generate({
            model: 'dall-e-3',
            prompt: finalImagePrompt + ' (Item 1).',
            n: 1,
            size: '1024x1024',
            response_format: 'b64_json',
          });
          const i2 = openai.images.generate({
            model: 'dall-e-3',
            prompt: finalImagePrompt + ' (Item 2).',
            n: 1,
            size: '1024x1024',
            response_format: 'b64_json',
          });
          const i3 = openai.images.generate({
            model: 'dall-e-3',
            prompt: finalImagePrompt + ' (Item 3).',
            n: 1,
            size: '1024x1024',
            response_format: 'b64_json',
          });

          const b64s = (await Promise.all([i1, i2, i3])).map(
            (r) => r.data[0].b64_json || ''
          );
          const allValid = b64s.every((b) => b);
          if (allValid) {
            const imgTag = `<div style="text-align:center; margin: 30px 0;">${b64s
              .map(
                (b) =>
                  `<img src="data:image/png;base64,${b}" style="width:200px; height:200px; margin:15px; display:inline-block; background-color:white; border:2px dashed #000; padding:10px;" />`
              )
              .join('')}</div>`;
            resultObj.html = resultObj.html.replace(
              '{{IMAGE_PLACEHOLDER}}',
              imgTag
            );
          } else {
            resultObj.html = resultObj.html.replace(
              '{{IMAGE_PLACEHOLDER}}',
              ''
            );
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

    // --- MODE: GAMIFIER (INSTANT QUIZ CSV) ---
    if (type === 'gamifier') {
      const gamePrompt = `You are an Elite Teacher Mentor. Create a 10-question multiple-choice trivia game based exactly on the elite lesson plan (the prize) for this lesson. It MUST be perfectly grade-level aware, subject aware, learner profile aware, and timing aware. Return ONLY a JSON object with a single string key "csv". The value must be a raw CSV string formatted perfectly for Kahoot/Blooket import. The first line of the CSV MUST be the exact header: Question,Answer 1,Answer 2,Answer 3,Answer 4,Time limit (sec),Correct answer(s). The following 10 lines must be the questions. Time limit must be 20 for all. Correct answer(s) must be 1, 2, 3, or 4. Grade: ${config.grade}, Subject: ${config.subject}, Profile: ${config.profile}, Time: ${config.minutes}m.`;
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: gamePrompt },
          { role: 'user', content: lessonText },
        ],
        response_format: { type: 'json_object' },
      });
      return NextResponse.json(
        JSON.parse(response.choices[0].message.content || '{}')
      );
    }

    // --- MODE: IEP SHAPESHIFTER ---
    if (type === 'iep') {
      const iepPrompt = `You are an Elite Teacher Mentor. Create a custom micro-scaffold accommodation (e.g., translated vocab cheat sheet, simplified 3-step checklist, visual guide) for a specific student with this profile: "${userMessage}". The accommodation must be perfectly based on this lesson. Grade: ${config.grade}, Subject: ${config.subject}, Time: ${config.minutes}m. Return ONLY a JSON object with a single string key "html". The value must be a fully styled HTML document using inline CSS (modern readable fonts, nice spacing, clear headings, student-friendly). Make it look beautiful, highly tailored, and ready to print.`;
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: iepPrompt },
          { role: 'user', content: lessonText },
        ],
        response_format: { type: 'json_object' },
      });
      return NextResponse.json(
        JSON.parse(response.choices[0].message.content || '{}')
      );
    }

    // --- MODE: SEQUENCING (CHAT) ---
    if (type === 'chat') {
      const systemContent = `You are a Mentor Coach having a one-on-one TEXT CHAT with a teacher.
      
      TEACHER SETTINGS:
      - Grade Level: ${config?.grade || 'General'}
      - Subject: ${config?.subject || 'General'}
      - Learner Profile: ${config?.profile || 'General'}
      - Class Time: ${config?.minutes || 45} minutes
      
      LESSON CONTEXT (First 500 chars):
      "${(lessonText || '').substring(0, 500)}"
      
      CURRENT FOCUS CARD: 
      - Category: ${lensContext?.name || 'General'}
      - Theory: ${lensContext?.theory || 'General principles'}
      - Feedback: ${lensContext?.lessonFeedback || 'N/A'}

      STRICT RULES FOR YOUR RESPONSE:
      1. Talk naturally, warmly, and concisely like a real human coach messaging them back. 
      2. Organize well with HTML. Use <br><br> for spacing, and inline CSS for clear, color-coded headings (e.g., <b style="color: #4ade80;">HEADING:</b>).
      3. Explicitly reference their specific lesson, learners, or the focus card in your advice to show you are highly context-aware.
      4. ABSOLUTELY NO MARKDOWN ALLOWED (no **, ##, *, etc.). Return pure HTML format. End with a brief, natural question.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemContent },
          ...(chatHistory || []),
          { role: 'user', content: userMessage || '' },
        ],
      });
      return NextResponse.json({
        reply: response.choices[0].message.content?.replace(/[*#]/g, ''),
      });
    }

    // --- MODE: ITERATIVE INIT ---
    if (type === 'iterative-init') {
      const initPrompt = `You are an Iterative Teacher Mentor. Review this lesson plan and provide exactly 3 specific contextual feedbacks aligned to specific sections.
      For each feedback, you MUST return:
      - "id": A unique string ID.
      - "quote": EXACT excerpt from the lesson text to improve (must perfectly match a substring in the lesson).
      - "theory": The educational theory applied.
      - "pioneer": The pioneer of this theory.
      - "pedagogy": Why this adjustment is pedagogically sound.
      - "alignment": How it aligns coherently with the other components of the lesson.
      - "revision": A concrete example of how to revise the quoted text.
      Return ONLY JSON: { "feedbacks":[ { "id", "quote", "theory", "pioneer", "pedagogy", "alignment", "revision" } ] }`;
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: initPrompt },
          { role: 'user', content: lessonText },
        ],
        response_format: { type: 'json_object' },
      });
      return NextResponse.json(
        JSON.parse(response.choices[0].message.content || '{}')
      );
    }

    // --- MODE: ITERATIVE RESPOND ---
    if (type === 'iterative-respond') {
      const fb = body.fb;
      const respPrompt = `The teacher responded to your feedback regarding the quote "${fb.quote}".
      Teacher's response: "${userMessage}"
      Update your feedback iteratively based on their response. Keep the same JSON structure.
      Return ONLY a JSON object: { "feedback": { "id": "${fb.id}", "quote": "${fb.quote}", "theory": "...", "pioneer": "...", "pedagogy": "...", "alignment": "...", "revision": "..." } }`;
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: respPrompt },
          { role: 'user', content: lessonText },
        ],
        response_format: { type: 'json_object' },
      });
      return NextResponse.json(
        JSON.parse(response.choices[0].message.content || '{}')
      );
    }

    // --- MODE: MAIN ANALYSIS ---
    let reportCommand: any =
      'For Full report mode: You MUST analyze and return an array of EXACTLY 12 objects covering ALL 12 categories (Clarity, Alignment, Inclusivity, Scaffolding, Differentiation, Objectives, Assessments, Engagement, Strategies, Materials, Collaboration, Closure) without skipping a single one. CRITICAL: YOU MUST OUTPUT ALL 12 CATEGORIES IN EXTREME DETAIL. DO NOT COMPRESS TEXT.';
    if (config.mode.includes('Focused'))
      reportCommand =
        'For Focused report mode: Analyze ONLY the top 3 highest-priority categories for this specific lesson.';
    if (config.mode.includes('Custom'))
      reportCommand = `For Custom selection mode: Analyze EXACTLY ALL ${
        selectedLenses.length
      } of these categories: ${selectedLenses.join(
        ', '
      )}. You MUST return a complete section for EVERY SINGLE ONE.`;

    const systemPrompt = `You are an Elite Teacher Mentor. Analyze the lesson for ${config.grade} ${config.subject} (${config.profile} learners).
    Tone: Strictly adopt a "${config.tone}" persona (drastically change your vocabulary, styling, and attitude to uniquely match this exact tone throughout the entire response; a 'Warm' tone must sound entirely different from a 'Direct' tone). Time: ${config.minutes}m.

    ${reportCommand}

    STRICT FORMATTING: NO markdown symbols (*, #). Use CAPITAL HEADERS.

    FOR EACH CATEGORY, you MUST provide (DO NOT SUMMARIZE, WRITE EXTENSIVELY):
    1. theory: (MINIMUM 150 words) detailed explanation of pioneer's work.
    2. lessonFeedback: (MINIMUM 150 words) deep, specific critique of this draft.
    3. upgrade: (MINIMUM 150 words) extensive details on how to adapt for ${config.profile} students.
    4. example: (MINIMUM 300 words) highly detailed move that fits the ${config.minutes}m window.
    5. quiz: 5 multiple-choice questions directly related to THIS SPECIFIC CATEGORY and based on its theory (question, options, correct).

    CATEGORIES TO CHOOSE FROM: Clarity, Alignment, Inclusivity, Scaffolding, Differentiation, Objectives, Assessments, Engagement, Strategies, Materials, Collaboration, Closure.

    Return JSON: { "feedback":[ { "id", "name", "pioneer", "theory", "lessonFeedback", "upgrade", "example", "quiz" } ] }`;

    const response = await openai.chat.completions.create({
      model: config.mode.includes('Full') ? 'gpt-4o-2024-08-06' : 'gpt-4o-mini',
      max_tokens: 16000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: lessonText },
      ],
      response_format: { type: 'json_object' },
    });
    // Reverted from parallel processing to fix memory crash
    // and network timeouts.

    return NextResponse.json(
      JSON.parse(response.choices[0].message.content || '{}')
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
