/**
 * Per-language rules for voice-pipeline gates — short-answer whitelists,
 * non-lexical filler patterns, goodbye phrase detection, and greeting
 * prefixes used by the goodbye-misfire guard.
 *
 * Background — why this module exists:
 *   The original implementation in custom-voice-ws.ts hardcoded English-
 *   only patterns at the top of the file and inside fireClaudeWithPolicy.
 *   JIE supports 25 languages and serves K-2 through College/Adult, where
 *   one-word answers like "sí" / "はい" / "네" / "да" are constant. With
 *   English-only short-answer whitelists, low-confidence non-English short
 *   replies were silently dropped at the min-word gate. JIE's confidence
 *   bypass (lastConf >= 0.20) masked this for high-confidence transcripts
 *   but failed for the K-2 cohort where Deepgram confidence on young
 *   voices is often below threshold.
 *
 * Architecture:
 *   - Tier 1 (en, es, fr, it, de, pt, zh): full short-answer / goodbye /
 *     greeting / filler-noise data PLUS K-2 grade-appropriate vocabulary
 *     (numbers as words, basic colors, common one-word academic answers).
 *     These are JIE's most-likely K-2 immersion / bilingual markets.
 *   - Tier 1.5 (nl): full data, no K-2 expansion (no K-2 cohort yet).
 *   - Tier 2 (ja, ko, ru, ar, hi, tr, pl, sv, da, no, fi, vi, th, id):
 *     script-native short answers, goodbyes, fillers — enough that real
 *     users can navigate sessions without false drops.
 *   - Tier 3 (sw, yo, ha): minimal data sufficient to navigate sessions.
 *
 *   Coherence-gate stopwords (server/services/coherence-gate.ts) and
 *   echo-guard ASCII normalize (server/services/echo-guard.ts) are in a
 *   FOLLOW-UP commit — they affect coaching quality and echo containment
 *   but not the session-liveness bugs this module targets.
 *
 * Interaction with isLanguagePracticeSession:
 *   The existing isLanguagePracticeSession(state.subject) bypass in
 *   shouldDropTranscript and fireClaudeWithPolicy is complementary, not
 *   redundant. That bypass detects when the SUBJECT being taught is a
 *   language (so "ah", "oh" are valid pronunciation practice). This
 *   module's rules pick the right whitelist based on the TUTOR LANGUAGE
 *   (state.language) the user is interacting in. Both stay active.
 *
 * Word boundaries:
 *   detectGoodbye uses Unicode-aware lookarounds `(?:^|\P{L})...(?:\P{L}|$)`
 *   with the /u flag instead of ASCII `\b`. The legacy non-Latin substring
 *   fallback is removed in favor of unified Unicode boundary regex, which
 *   correctly handles CJK / Cyrillic / Arabic / Devanagari / Thai while
 *   preserving original Latin-script behavior.
 *
 * Origin: ported from jarvis-rehearsal commit bfc19c0 (May 18 2026), with
 * K-2 vocabulary additions for JIE's elementary-grade learners and
 * Spanish/Mandarin immersion programs.
 */

export type LanguageCode =
  | 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'nl'
  | 'ja' | 'ko' | 'zh' | 'ru' | 'ar' | 'hi'
  | 'tr' | 'pl' | 'sv' | 'da' | 'no' | 'fi'
  | 'vi' | 'th' | 'id'
  | 'sw' | 'yo' | 'ha';

export interface LanguageRules {
  /** 1-word tokens that pass the min-word gate. Lowercase, no punctuation. */
  validShortAnswers: Set<string>;
  /**
   * Non-lexical fillers always dropped even at 3+ words. Tested against
   * the normalized (lowercased, letter-only) full utterance, so multi-token
   * filler chains like "um um um" match the same pattern.
   */
  nonLexicalNoiseRegex: RegExp;
  /** Multi-word goodbye phrases, most specific first. Lowercase. */
  goodbyePhrases: string[];
  /**
   * Goodbye phrases that must comprise the entire short utterance (≤3 words)
   * to count. Prevents "tell her I said bye" from ending the session.
   */
  singleTokenGoodbyes: Set<string>;
  /**
   * Greeting prefixes — if the utterance STARTS with any of these, the
   * goodbye detector bails (a greeting can never be a goodbye even if it
   * contains goodbye-ish tokens later).
   */
  greetingPrefixes: string[];
}

// ────────────────────────────────────────────────────────────────────────
// TIER 1 — full rule sets WITH K-2 vocabulary
// English / Spanish / French / German / Italian / Portuguese / Chinese
// ────────────────────────────────────────────────────────────────────────

const EN: LanguageRules = {
  validShortAnswers: new Set([
    // Core affirmations & negations
    'yes', 'no', 'yeah', 'yep', 'yup', 'nah', 'nope',
    'sure', 'ok', 'okay', 'correct', 'right', 'wrong',
    'true', 'false', 'maybe', 'probably', 'definitely',
    'absolutely', 'exactly', 'indeed', 'certainly',
    // Frequency & quantity
    'always', 'never', 'sometimes', 'both', 'neither',
    'all', 'none', 'some', 'many', 'few', 'most',
    'less', 'more', 'each', 'every', 'enough',
    // Pronouns & determiners
    'nothing', 'everything', 'something', 'anything',
    'everyone', 'nobody', 'somebody', 'anybody',
    'here', 'there', 'this', 'that', 'those', 'these',
    'me', 'him', 'her', 'them', 'us', 'it', 'mine',
    // Question words (student repeating/confirming)
    'what', 'who', 'why', 'how', 'when', 'where', 'which',
    // Session control
    'stop', 'wait', 'continue', 'repeat', 'again', 'next',
    'help', 'skip', 'harder', 'easier', 'slower', 'faster',
    'done', 'ready', 'start', 'finish', 'quit', 'back',
    // Greetings & politeness
    'hello', 'hi', 'hey', 'bye', 'goodbye', 'thanks',
    'please', 'sorry', 'welcome',
    // Reactions & feelings
    'wow', 'cool', 'nice', 'great', 'awesome', 'perfect',
    'good', 'bad', 'fine', 'amazing', 'interesting',
    'confused', 'lost', 'stuck', 'unsure', 'understand',
    // Academic responses
    'agree', 'disagree', 'forgot', 'remember', 'know',
    'think', 'guess', 'believe', 'depends', 'different',
    'same', 'similar', 'opposite', 'equal', 'zero',
    // Ordinals & comparisons
    'first', 'second', 'third', 'last',
    'bigger', 'smaller', 'higher', 'lower',
    // K-2 subject words
    'water', 'earth', 'sun', 'moon', 'gravity',
    'energy', 'light', 'sound', 'heat', 'oxygen',
    'north', 'south', 'east', 'west',
    'addition', 'subtraction', 'multiplication', 'division',
    // Numbers as words
    'one', 'two', 'three', 'four', 'five',
    'six', 'seven', 'eight', 'nine', 'ten',
    'hundred', 'thousand', 'million', 'half', 'double',
    // K-2 colors
    'red', 'blue', 'green', 'yellow', 'orange', 'purple',
    'pink', 'black', 'white', 'brown', 'gray', 'grey',
  ]),
  nonLexicalNoiseRegex: /^(um+|uh+|hmm+|hm+|er+|erm+|mhm+)$/i,
  goodbyePhrases: [
    'see you later', 'talk to you later', 'catch you later',
    'thank you goodbye', 'thanks goodbye', 'thank you bye', 'thanks bye',
    'end the session', 'stop the session', 'end session', 'stop tutoring',
    'end the call', 'end this call', 'end this session',
    'i have to leave', 'i need to leave', 'leaving now',
    'gotta go', 'got to go', 'have to go', 'need to go', 'talk later',
    "i'm done", 'im done', 'i am done', 'we are done', "we're done",
    "that's all", 'thats all', "that's it", 'thats it',
    'good night', 'goodnight', 'night night', 'nighty night',
    'good bye', 'bye bye',
    'goodbye', 'bye', 'see ya',
    // Cross-language farewells used colloquially by English speakers (May 18 2026):
    // English speakers frequently use these as goodbyes regardless of session
    // language. Required so "That's all I needed. Adios." fires even when the
    // session language is set to English.
    'adios', 'adiós', 'ciao', 'sayonara', 'au revoir', 'hasta luego', 'hasta la vista',
    // Explicit session-end commands (May 18 2026): users sometimes give a
    // direct instruction to disconnect rather than a conventional farewell.
    'please disconnect', 'you should disconnect', 'you should be disconnecting',
    'time to disconnect', 'disconnect now', 'please end the session',
    'you can disconnect', 'you can hang up', 'hang up now',
  ],
  singleTokenGoodbyes: new Set(['goodbye', 'bye', 'see ya', 'later', 'adios', 'adiós', 'ciao', 'sayonara', 'disconnect']),
  greetingPrefixes: [
    'hi ', 'hi,', 'hi.', 'hi!',
    'hello ', 'hello,', 'hello.', 'hello!',
    'hey ', 'hey,', 'hey.', 'hey!',
    'good to ', 'nice to ', 'great to ', 'pleased to ',
    'happy to ', 'glad to ', 'welcome ',
    'good morning', 'good afternoon', 'good evening',
    'how are you', "how's it going", "what's up", 'whats up',
  ],
};

const ES: LanguageRules = {
  validShortAnswers: new Set([
    // Affirmations / negations
    'hola', 'sí', 'si', 'no', 'claro', 'gracias', 'vale', 'bien', 'mal',
    'perfecto', 'exacto', 'exactamente', 'cierto', 'falso', 'verdad',
    'quizás', 'quizas', 'tal', 'depende', 'listo', 'lista', 'ok', 'okay',
    'absolutamente', 'desde luego', 'por supuesto',
    // Session control
    'ya', 'basta', 'espera', 'sigue', 'continúa', 'continua', 'repite',
    'otra', 'siguiente', 'ayuda', 'salta', 'pasa', 'más', 'mas',
    'difícil', 'dificil', 'fácil', 'facil',
    // Acknowledgements
    'entendido', 'comprendido', 'interesante', 'fascinante',
    'adiós', 'adios', 'chao',
    'reinicia', 'pausa', 'cancela',
    // K-2: numbers
    'uno', 'dos', 'tres', 'cuatro', 'cinco',
    'seis', 'siete', 'ocho', 'nueve', 'diez',
    'cien', 'mil', 'mitad', 'doble', 'cero',
    // K-2: colors
    'rojo', 'azul', 'verde', 'amarillo', 'naranja', 'morado',
    'rosa', 'negro', 'blanco', 'marrón', 'marron', 'gris',
    // K-2: subject words
    'agua', 'tierra', 'sol', 'luna', 'gravedad',
    'energía', 'energia', 'luz', 'sonido', 'calor', 'oxígeno', 'oxigeno',
    'norte', 'sur', 'este', 'oeste',
    'suma', 'resta', 'multiplicación', 'multiplicacion', 'división', 'division',
  ]),
  // Spanish hesitation: "eh", "este", "pues", "emm", "ehm".
  nonLexicalNoiseRegex: /^(eh+|emm+|ehm+|mmm+|pues|este)$/i,
  goodbyePhrases: [
    'hasta luego', 'hasta pronto', 'hasta mañana', 'hasta manana',
    'nos vemos', 'hasta la vista', 'me tengo que ir', 'tengo que irme',
    'me voy', 'tengo que salir',
    'termina la sesión', 'terminar la sesión', 'termina la sesion',
    'terminar sesión', 'terminar sesion', 'parar', 'detén', 'deten',
    'eso es todo', 'ya está', 'ya esta', 'hemos terminado',
    'buenas noches',
    'adiós', 'adios', 'chao', 'chau',
  ],
  singleTokenGoodbyes: new Set(['adiós', 'adios', 'chao', 'chau']),
  greetingPrefixes: [
    'hola', 'buenos días', 'buenos dias', 'buenas tardes',
    'buen día', 'buen dia', 'qué tal', 'que tal',
    'cómo estás', 'como estas', 'cómo está', 'como esta',
  ],
};

const FR: LanguageRules = {
  validShortAnswers: new Set([
    'bonjour', 'salut', 'oui', 'non', 'ouais', 'merci',
    "d'accord", 'daccord', 'ok', 'okay', 'parfait', 'exact', 'exactement',
    'peut-être', 'sûrement', 'surement', 'probablement',
    'vrai', 'faux', 'prêt', 'pret', 'prête', 'prete', 'fini', 'finie',
    'attends', 'continue', 'répète', 'repete', 'encore', 'suivant', 'aide',
    'passe', 'saute', 'plus', 'difficile', 'facile',
    'compris', 'absolument', 'intéressant', 'interessant', 'fascinant',
    'au revoir', 'adieu', 'ciao', 'recommence', 'pause', 'annule',
    // K-2: numbers
    'un', 'une', 'deux', 'trois', 'quatre', 'cinq',
    'six', 'sept', 'huit', 'neuf', 'dix',
    'cent', 'mille', 'moitié', 'moitie', 'double', 'zéro', 'zero',
    // K-2: colors
    'rouge', 'bleu', 'bleue', 'vert', 'verte', 'jaune',
    'orange', 'violet', 'violette', 'rose', 'noir', 'noire',
    'blanc', 'blanche', 'marron', 'gris', 'grise',
    // K-2: subject words
    'eau', 'terre', 'soleil', 'lune', 'gravité', 'gravite',
    'énergie', 'energie', 'lumière', 'lumiere', 'son', 'chaleur', 'oxygène', 'oxygene',
    'nord', 'sud', 'ouest',
    'addition', 'soustraction', 'multiplication', 'division',
  ]),
  // French hesitation: "euh", "ben", "bah", "hein", "hm".
  nonLexicalNoiseRegex: /^(euh+|hein|bah|ben|hm+)$/i,
  goodbyePhrases: [
    'à plus tard', 'à plus', 'a plus tard', 'a plus',
    'à bientôt', 'à bientot', 'a bientot', 'à demain', 'a demain',
    'je dois partir', 'je dois y aller', "il faut que j'y aille",
    "faut que j'y aille",
    'terminer la session', 'terminer session', 'arrête', 'arrete',
    "c'est tout", 'cest tout', "c'est fini", 'cest fini', 'on a fini',
    'bonne nuit', 'bonne soirée', 'bonne soiree',
    'au revoir', 'adieu', 'ciao',
  ],
  singleTokenGoodbyes: new Set(['adieu', 'ciao']),
  greetingPrefixes: [
    'bonjour', 'bonsoir', 'salut', 'coucou', 'ça va', 'ca va',
  ],
};

const IT: LanguageRules = {
  validShortAnswers: new Set([
    'ciao', 'sì', 'si', 'no', 'certo', 'grazie', 'prego', 'bene', 'male',
    'perfetto', 'esatto', 'esattamente', 'forse', 'probabilmente',
    'vero', 'falso', 'pronto', 'pronta', 'fatto', 'fatta',
    'aspetta', 'continua', 'ripeti', 'ancora', 'prossimo', 'aiuto',
    'salta', 'passa', 'più', 'piu', 'difficile', 'facile',
    'capito', 'assolutamente', 'interessante', 'affascinante',
    'arrivederci', 'addio', 'salve',
    'ricomincia', 'pausa', 'annulla',
    // K-2: numbers
    'uno', 'due', 'tre', 'quattro', 'cinque',
    'sei', 'sette', 'otto', 'nove', 'dieci',
    'cento', 'mille', 'metà', 'meta', 'doppio', 'zero',
    // K-2: colors
    'rosso', 'rossa', 'blu', 'verde', 'giallo', 'gialla',
    'arancione', 'viola', 'rosa', 'nero', 'nera',
    'bianco', 'bianca', 'marrone', 'grigio', 'grigia',
    // K-2: subject words
    'acqua', 'terra', 'sole', 'luna', 'gravità', 'gravita',
    'energia', 'luce', 'suono', 'calore', 'ossigeno',
    'nord', 'sud', 'est', 'ovest',
    'addizione', 'sottrazione', 'moltiplicazione', 'divisione',
  ]),
  // Italian hesitation: "eh", "ehm", "boh", "mah", "mmm".
  nonLexicalNoiseRegex: /^(eh+|ehm+|mmm+|boh|mah)$/i,
  goodbyePhrases: [
    'a dopo', 'a presto', 'a domani', 'ci vediamo', 'ci sentiamo',
    'devo andare', 'devo scappare', 'ho da fare', 'mi devo muovere',
    'terminare la sessione', 'terminare sessione', 'ferma', 'fermati',
    'è tutto', 'e tutto', 'abbiamo finito', 'basta così', 'basta cosi',
    'buona notte', 'buonanotte',
    'arrivederci', 'addio', 'ciao ciao',
  ],
  singleTokenGoodbyes: new Set(['arrivederci', 'addio']),
  greetingPrefixes: [
    // 'ciao' deliberately omitted — 'ciao ciao' is in the goodbye list,
    // so a 'ciao' startsWith match would block legitimate 'ciao ciao'
    // farewells. Bare 'ciao' still passes through validShortAnswers; the
    // goodbye list only fires on the doubled form.
    'buongiorno', 'buonasera', 'salve', 'come stai', 'come va',
  ],
};

const DE: LanguageRules = {
  validShortAnswers: new Set([
    'hallo', 'hi', 'ja', 'nein', 'doch', 'klar', 'sicher', 'danke', 'bitte',
    'genau', 'exakt', 'vielleicht', 'wahrscheinlich', 'wahr', 'falsch',
    'fertig', 'bereit', 'warte', 'weiter', 'wiederhole', 'nochmal',
    'nächstes', 'nachstes', 'hilfe', 'überspringe', 'uberspringe',
    'mehr', 'schwerer', 'leichter',
    'verstanden', 'absolut', 'interessant', 'faszinierend',
    'tschüss', 'tschuss', 'wiedersehen', 'ade',
    'neustart', 'pause', 'abbrechen',
    // K-2: numbers
    'eins', 'zwei', 'drei', 'vier', 'fünf', 'funf',
    'sechs', 'sieben', 'acht', 'neun', 'zehn',
    'hundert', 'tausend', 'hälfte', 'halfte', 'doppel', 'null',
    // K-2: colors
    'rot', 'rote', 'blau', 'blaue', 'grün', 'grun', 'gelb', 'gelbe',
    'orange', 'lila', 'rosa', 'schwarz', 'schwarze',
    'weiß', 'weiss', 'weiße', 'weisse', 'braun', 'braune', 'grau', 'graue',
    // K-2: subject words
    'wasser', 'erde', 'sonne', 'mond', 'schwerkraft',
    'energie', 'licht', 'schall', 'wärme', 'warme', 'sauerstoff',
    'norden', 'süden', 'suden', 'osten', 'westen',
    'addition', 'subtraktion', 'multiplikation', 'division',
  ]),
  // German hesitation: "ähm", "öh", "äh", "tja", "naja".
  nonLexicalNoiseRegex: /^(ähm+|äh+|öh+|ahm+|ah+|tja|naja)$/i,
  goodbyePhrases: [
    'bis später', 'bis spater', 'bis bald', 'bis morgen', 'bis dann',
    'ich muss gehen', 'ich muss los', 'ich muss weg',
    'sitzung beenden', 'session beenden', 'beenden', 'stopp',
    'das wars', "das war's", 'das ist alles', 'wir sind fertig',
    'gute nacht',
    'auf wiedersehen', 'tschüss', 'tschuss', 'tschüs', 'ade',
  ],
  singleTokenGoodbyes: new Set(['tschüss', 'tschuss', 'tschüs', 'ade', 'wiedersehen']),
  greetingPrefixes: [
    'hallo', 'hi', 'guten morgen', 'guten tag', 'guten abend',
    'servus', 'moin', 'grüß', 'gruss', 'wie geht',
  ],
};

const PT: LanguageRules = {
  validShortAnswers: new Set([
    'olá', 'ola', 'oi', 'sim', 'não', 'nao', 'claro', 'obrigado', 'obrigada',
    'bem', 'mal', 'perfeito', 'exato', 'exatamente', 'talvez', 'provavelmente',
    'verdade', 'falso', 'pronto', 'pronta', 'feito', 'feita',
    'espera', 'continua', 'repete', 'novamente', 'próximo', 'proximo',
    'ajuda', 'passa', 'pula', 'mais', 'difícil', 'dificil', 'fácil', 'facil',
    'entendido', 'absolutamente', 'interessante', 'fascinante',
    'tchau', 'adeus', 'até', 'ate',
    'reinicia', 'pausa', 'cancela',
    // K-2: numbers
    'um', 'uma', 'dois', 'duas', 'três', 'tres', 'quatro', 'cinco',
    'seis', 'sete', 'oito', 'nove', 'dez',
    'cem', 'mil', 'metade', 'dobro', 'zero',
    // K-2: colors
    'vermelho', 'vermelha', 'azul', 'verde', 'amarelo', 'amarela',
    'laranja', 'roxo', 'roxa', 'rosa', 'preto', 'preta',
    'branco', 'branca', 'marrom', 'cinza', 'cinzento',
    // K-2: subject words
    'água', 'agua', 'terra', 'sol', 'lua', 'gravidade',
    'energia', 'luz', 'som', 'calor', 'oxigênio', 'oxigenio',
    'norte', 'sul', 'leste', 'oeste',
    'adição', 'adicao', 'subtração', 'subtracao', 'multiplicação', 'multiplicacao',
    'divisão', 'divisao',
  ]),
  // Portuguese hesitation: "é", "hum", "ah", "eh", "hã".
  nonLexicalNoiseRegex: /^(é+|hum+|ah+|eh+|hã+|ha+)$/i,
  goodbyePhrases: [
    'até logo', 'ate logo', 'até mais', 'ate mais', 'até breve', 'ate breve',
    'até amanhã', 'ate amanha', 'até depois', 'ate depois',
    'tenho que ir', 'preciso ir', 'tenho de ir',
    'encerrar sessão', 'encerrar sessao', 'terminar sessão', 'terminar sessao',
    'pare', 'parar',
    'é tudo', 'e tudo', 'terminamos', 'acabamos', 'chega',
    'boa noite',
    'tchau', 'adeus', 'tchauzinho',
  ],
  singleTokenGoodbyes: new Set(['tchau', 'adeus', 'tchauzinho']),
  greetingPrefixes: [
    // 'boa noite' deliberately omitted — listed as a goodbye phrase below.
    'olá', 'ola', 'oi', 'bom dia', 'boa tarde',
    'e aí', 'e ai', 'tudo bem', 'tudo bom',
  ],
};

const ZH: LanguageRules = {
  validShortAnswers: new Set([
    '是', '不', '不是', '对', '不对', '好', '不好', '行', '不行',
    '嗯', '哦', '啊', '可以', '不可以', '当然',
    '明白', '懂了', '了解', '知道',
    '停', '等', '继续', '再来', '帮助', '帮帮',
    '下一个', '跳过', '错', '对了',
    '谢谢', '不客气', '你好', '再见',
    // K-2: numbers
    '零', '一', '二', '两', '三', '四', '五',
    '六', '七', '八', '九', '十',
    '百', '千', '万', '一半', '一倍',
    // K-2: colors
    '红', '红色', '蓝', '蓝色', '绿', '绿色',
    '黄', '黄色', '橙', '橙色', '紫', '紫色',
    '粉', '粉色', '黑', '黑色', '白', '白色',
    '棕', '棕色', '灰', '灰色',
    // K-2: subject words
    '水', '土', '太阳', '月亮', '重力',
    '能量', '光', '声音', '热', '氧气',
    '北', '南', '东', '西',
    '加法', '减法', '乘法', '除法',
  ]),
  // Chinese hesitation: "嗯", "呃", "那个", "这个", "就是".
  nonLexicalNoiseRegex: /^(嗯+|呃+|啊+|那个|这个|就是)$/,
  goodbyePhrases: [
    '再见', '拜拜', '回头见', '回见', '一会儿见', '明天见',
    '我得走了', '我要走了', '我先走了',
    '结束', '结束会话', '结束本次会话', '停止',
    '就这样', '完了', '到此为止',
    '晚安',
  ],
  singleTokenGoodbyes: new Set(['再见', '拜拜', '回见']),
  greetingPrefixes: [
    '你好', '您好', '早', '早上好', '下午好', '晚上好', '哈喽', '嗨',
  ],
};

// ────────────────────────────────────────────────────────────────────────
// TIER 1.5 — Dutch (full data, no K-2 cohort yet)
// ────────────────────────────────────────────────────────────────────────

const NL: LanguageRules = {
  validShortAnswers: new Set([
    'hallo', 'hoi', 'hé', 'he', 'ja', 'nee', 'zeker', 'prima', 'dank',
    'dankjewel', 'bedankt', 'alsjeblieft', 'perfect', 'precies', 'misschien',
    'waarschijnlijk', 'waar', 'onwaar', 'klaar', 'wacht', 'herhaal',
    'opnieuw', 'volgende', 'help', 'sla', 'over', 'meer',
    'moeilijker', 'makkelijker',
    'begrepen', 'absoluut', 'interessant', 'fascinerend',
    'doei', 'dag', 'tot', 'ziens',
    'herstart', 'pauze', 'annuleer',
  ]),
  // Dutch hesitation: "eh", "uh", "nou", "tja", "ja-ja".
  nonLexicalNoiseRegex: /^(eh+|uh+|hm+|nou|tja)$/i,
  goodbyePhrases: [
    'tot ziens', 'tot straks', 'tot later', 'tot morgen', 'tot snel',
    'ik moet gaan', 'ik moet ervandoor', 'ik moet weg',
    'sessie beëindigen', 'sessie beeindigen', 'beëindig', 'beeindig',
    'stop', 'stoppen',
    'dat is alles', 'we zijn klaar', 'we zijn er klaar mee',
    'goedenacht', 'goede nacht', 'welterusten',
    'doei', 'dag', 'doeg',
  ],
  singleTokenGoodbyes: new Set(['doei', 'dag', 'doeg']),
  greetingPrefixes: [
    'hallo', 'hoi', 'hé', 'goedemorgen', 'goedemiddag', 'goedenavond',
    'hoe gaat', 'hoe is',
  ],
};

// ────────────────────────────────────────────────────────────────────────
// TIER 2 — short answer + goodbye + filler coverage
// (K-2 vocab expansion in follow-up commit per usage data.)
// ────────────────────────────────────────────────────────────────────────

const JA: LanguageRules = {
  validShortAnswers: new Set([
    'はい', 'いいえ', 'ええ', 'うん', 'ううん', 'そう', 'そうです',
    'わかった', 'わかりました', 'りょうかい', '了解',
    'やめて', 'やめる', '待って', '続けて', 'もう一度', '助けて',
    '次', 'パス', '違う', '正解', '間違い', '終わり',
    'ありがとう', 'すみません', 'こんにちは', 'さようなら',
  ]),
  // Japanese hesitation: "えーと", "えっと", "あの", "そのー", "うー".
  nonLexicalNoiseRegex: /^(えーと|えっと|あの|そのー|うー|あー|まあ)$/,
  goodbyePhrases: [
    'さようなら', 'さよなら', 'またね', 'また明日', 'また後で',
    'バイバイ', 'バイ',
    '行かなきゃ', '行かないと', '失礼します',
    'セッションを終了', 'セッション終了', '終了して', '終了します',
    '止めて', '止めます',
    'これで終わり', '以上です',
    'おやすみ', 'おやすみなさい',
  ],
  singleTokenGoodbyes: new Set(['さようなら', 'さよなら', 'バイバイ', 'バイ']),
  greetingPrefixes: [
    'こんにちは', 'おはよう', 'おはようございます',
    'こんばんは', 'やあ', 'もしもし',
  ],
};

const KO: LanguageRules = {
  validShortAnswers: new Set([
    '네', '예', '아니요', '아니오', '아뇨', '응', '아니', '맞아요', '맞습니다',
    '알겠어요', '알겠습니다', '이해했어요',
    '그만', '잠깐', '계속', '다시', '도와줘요', '도와주세요',
    '다음', '패스', '틀려요', '맞아', '끝',
    '감사', '감사합니다', '고마워', '고마워요',
    '안녕', '안녕하세요',
  ]),
  // Korean hesitation: "음", "어", "그", "저", "아".
  nonLexicalNoiseRegex: /^(음+|어+|그+|저+|아+)$/,
  goodbyePhrases: [
    '안녕히 가세요', '안녕히 계세요', '잘 가요', '잘 가',
    '나중에 봐요', '나중에 봐', '다음에 봐요',
    '가야 해요', '가야겠어요', '먼저 갈게요',
    '세션 종료', '세션을 종료', '종료', '끝내요', '끝내자',
    '멈춰', '멈춰요',
    '이게 다예요', '이상입니다', '끝났어요',
    '잘 자', '잘 자요',
  ],
  singleTokenGoodbyes: new Set(['안녕', '바이바이']),
  greetingPrefixes: [
    // '안녕' deliberately omitted — every Korean goodbye phrase starts with
    // '안녕히' ('peacefully'), and a '안녕' startsWith match would block them
    // all. Bare '안녕' still passes through validShortAnswers; only the
    // longer goodbye forms ('안녕히 가세요', '안녕히 계세요') fire end-session.
    '안녕하세요', '여보세요', '어떻게',
  ],
};

const RU: LanguageRules = {
  validShortAnswers: new Set([
    'привет', 'здравствуйте', 'да', 'нет', 'конечно', 'спасибо', 'пожалуйста',
    'хорошо', 'плохо', 'отлично', 'точно', 'именно', 'возможно',
    'правда', 'неправда', 'готов', 'готова',
    'жди', 'продолжай', 'повтори', 'снова', 'дальше', 'помощь',
    'пропусти', 'больше', 'сложнее', 'легче',
    'понял', 'поняла', 'понятно', 'абсолютно', 'интересно',
    'пока', 'прощай', 'досвидания',
  ]),
  nonLexicalNoiseRegex: /^(э+|эм+|ну|мм+|хм+)$/i,
  goodbyePhrases: [
    'до свидания', 'досвидания', 'до встречи', 'до завтра', 'увидимся',
    'мне пора', 'мне нужно идти', 'я должен идти', 'я должна идти',
    'закончить сессию', 'завершить сессию', 'стоп', 'хватит',
    'это всё', 'это все', 'мы закончили',
    'спокойной ночи', 'доброй ночи',
    'пока', 'прощай', 'чао',
  ],
  singleTokenGoodbyes: new Set(['пока', 'прощай', 'чао']),
  greetingPrefixes: [
    'привет', 'здравствуй', 'здравствуйте', 'доброе утро', 'добрый день',
    'добрый вечер', 'как дела', 'как ты',
  ],
};

const AR: LanguageRules = {
  validShortAnswers: new Set([
    'مرحبا', 'أهلا', 'نعم', 'لا', 'أكيد', 'بالتأكيد', 'شكرا',
    'حسنا', 'حسناً', 'تمام', 'صحيح', 'خطأ', 'ربما',
    'انتظر', 'استمر', 'كرر', 'مرة', 'التالي', 'مساعدة',
    'تخطى', 'أكثر', 'أصعب', 'أسهل',
    'فهمت', 'مفهوم', 'مثير', 'وداعا',
  ]),
  nonLexicalNoiseRegex: /^(آه+|أه+|أم+|إم+|يعني)$/,
  goodbyePhrases: [
    'إلى اللقاء', 'مع السلامة', 'إلى الغد', 'أراك لاحقا',
    'يجب أن أذهب', 'علي الذهاب',
    'إنهاء الجلسة', 'إيقاف', 'توقف',
    'هذا كل شيء', 'انتهينا',
    'تصبح على خير', 'ليلة سعيدة',
    'وداعا', 'باي',
  ],
  singleTokenGoodbyes: new Set(['وداعا', 'باي']),
  greetingPrefixes: [
    'مرحبا', 'أهلا', 'السلام', 'صباح', 'مساء', 'كيف',
  ],
};

const HI: LanguageRules = {
  validShortAnswers: new Set([
    'नमस्ते', 'नमस्कार', 'हाँ', 'हां', 'नहीं', 'नही', 'जी', 'जरूर',
    'धन्यवाद', 'शुक्रिया', 'ठीक', 'अच्छा', 'सही', 'गलत', 'शायद',
    'रुको', 'जारी', 'फिर', 'दोबारा', 'अगला', 'मदद',
    'छोड़ो', 'अधिक', 'कठिन', 'आसान',
    'समझा', 'समझ', 'बिल्कुल', 'दिलचस्प',
    'अलविदा', 'बाय',
  ]),
  nonLexicalNoiseRegex: /^(अं+|उम+|हम+|मतलब|यानी)$/,
  goodbyePhrases: [
    'फिर मिलेंगे', 'बाद में मिलेंगे', 'कल मिलेंगे', 'चलता हूँ', 'चलती हूँ',
    'मुझे जाना है', 'मुझे जाना होगा',
    'सत्र समाप्त', 'सत्र खत्म', 'खत्म', 'रुको',
    'बस इतना', 'हो गया',
    'शुभ रात्रि',
    'अलविदा', 'बाय', 'टा',
  ],
  singleTokenGoodbyes: new Set(['अलविदा', 'बाय', 'टा']),
  greetingPrefixes: [
    'नमस्ते', 'नमस्कार', 'सलाम', 'हैलो', 'हाय', 'सुप्रभात',
  ],
};

const TR: LanguageRules = {
  validShortAnswers: new Set([
    'merhaba', 'selam', 'evet', 'hayır', 'hayir', 'tabii', 'teşekkür', 'tesekkur',
    'tamam', 'iyi', 'kötü', 'kotu', 'doğru', 'dogru', 'yanlış', 'yanlis',
    'belki', 'muhtemelen', 'hazır', 'hazir', 'bekle', 'devam', 'tekrar',
    'sonraki', 'yardım', 'yardim', 'atla', 'daha',
    'zor', 'kolay', 'anladım', 'anladim', 'kesinlikle', 'ilginç', 'ilginc',
    'güle güle', 'gule gule', 'hoşça', 'hosca',
  ]),
  nonLexicalNoiseRegex: /^(ııı+|şey+|sey+|yani|hmm+|eee+)$/i,
  goodbyePhrases: [
    'görüşürüz', 'gorusuruz', 'sonra görüşürüz', 'yarın görüşürüz',
    'gitmem gerek', 'gitmem lazım', 'gitmem lazim',
    'oturumu bitir', 'seansı bitir', 'durdur', 'dur',
    'hepsi bu', 'bitti', 'tamam bu kadar',
    'iyi geceler',
    'güle güle', 'gule gule', 'hoşça kal', 'hosca kal',
  ],
  singleTokenGoodbyes: new Set([]),
  greetingPrefixes: [
    'merhaba', 'selam', 'günaydın', 'gunaydin', 'iyi günler',
    'iyi akşamlar', 'nasılsın', 'nasilsin',
  ],
};

const PL: LanguageRules = {
  validShortAnswers: new Set([
    'cześć', 'czesc', 'witaj', 'tak', 'nie', 'jasne', 'pewnie', 'dzięki', 'dzieki',
    'dziękuję', 'dziekuje', 'dobrze', 'źle', 'zle', 'racja', 'fałsz', 'falsz',
    'może', 'moze', 'prawdopodobnie', 'gotowy', 'gotowa', 'czekaj', 'kontynuuj',
    'powtórz', 'powtorz', 'znowu', 'następny', 'nastepny', 'pomoc', 'pomiń', 'pomin',
    'więcej', 'wiecej', 'trudniejsze', 'łatwiejsze', 'latwiejsze',
    'rozumiem', 'absolutnie', 'ciekawe', 'fascynujące', 'fascynujace',
    'pa', 'do widzenia',
  ]),
  nonLexicalNoiseRegex: /^(yyy+|eee+|hmm+|no|noo+)$/i,
  goodbyePhrases: [
    'do widzenia', 'do zobaczenia', 'do jutra', 'na razie',
    'muszę iść', 'musze isc', 'muszę lecieć', 'musze leciec',
    'zakończ sesję', 'zakoncz sesje', 'zatrzymaj', 'stop',
    'to wszystko', 'skończyliśmy', 'skonczylismy',
    'dobranoc',
    'pa', 'żegnaj', 'zegnaj',
  ],
  singleTokenGoodbyes: new Set(['pa', 'żegnaj', 'zegnaj']),
  greetingPrefixes: [
    'cześć', 'czesc', 'witaj', 'dzień dobry', 'dzien dobry', 'dobry wieczór',
    'dobry wieczor', 'siema', 'jak się masz', 'jak sie masz',
  ],
};

const SV: LanguageRules = {
  validShortAnswers: new Set([
    'hej', 'hallå', 'halla', 'ja', 'nej', 'jo', 'visst', 'tack', 'snälla', 'snalla',
    'bra', 'dåligt', 'daligt', 'rätt', 'ratt', 'fel', 'kanske', 'troligen',
    'redo', 'klar', 'klart', 'vänta', 'vanta', 'fortsätt', 'fortsatt',
    'upprepa', 'igen', 'nästa', 'nasta', 'hjälp', 'hjalp', 'hoppa', 'över', 'over',
    'mer', 'svårare', 'svarare', 'lättare', 'lattare',
    'förstått', 'forstatt', 'absolut', 'intressant',
    'hej då', 'hej da', 'adjö', 'adjo',
  ]),
  nonLexicalNoiseRegex: /^(öh+|oh+|äh+|ah+|hm+|alltså|alltsa)$/i,
  goodbyePhrases: [
    'vi ses', 'ses senare', 'vi hörs', 'vi hors', 'i morgon',
    'jag måste gå', 'jag maste ga', 'jag måste sticka',
    'avsluta sessionen', 'avsluta', 'stoppa',
    'det är allt', 'det ar allt', 'vi är klara', 'vi ar klara',
    'god natt',
    'hej då', 'hej da', 'adjö', 'adjo',
  ],
  singleTokenGoodbyes: new Set(['adjö', 'adjo']),
  greetingPrefixes: [
    'hej', 'hallå', 'halla', 'god morgon', 'god dag', 'god kväll',
    'god kvall', 'tjena', 'hur mår', 'hur mar',
  ],
};

const DA: LanguageRules = {
  validShortAnswers: new Set([
    'hej', 'halløj', 'halloj', 'ja', 'nej', 'jo', 'sikkert', 'tak', 'velbekomme',
    'godt', 'dårligt', 'darligt', 'rigtigt', 'forkert', 'måske', 'maske',
    'sandsynligvis', 'klar', 'færdig', 'faerdig', 'vent', 'fortsæt', 'fortsaet',
    'gentag', 'igen', 'næste', 'naeste', 'hjælp', 'hjaelp', 'spring', 'over',
    'mere', 'sværere', 'svaerere', 'nemmere',
    'forstået', 'forstaaet', 'absolut', 'interessant',
    'farvel', 'hej hej',
  ]),
  nonLexicalNoiseRegex: /^(øh+|oh+|æh+|aeh+|hm+|altså|altsa)$/i,
  goodbyePhrases: [
    'vi ses', 'ses senere', 'i morgen',
    'jeg skal gå', 'jeg skal ga', 'jeg må af sted', 'jeg ma af sted',
    'afslut sessionen', 'afslut', 'stop',
    'det er det hele', 'vi er færdige', 'vi er faerdige',
    'godnat',
    'farvel', 'hej hej',
  ],
  singleTokenGoodbyes: new Set(['farvel']),
  greetingPrefixes: [
    'hej', 'halløj', 'halloj', 'godmorgen', 'goddag', 'godaften',
    'hvordan', 'hvordan har',
  ],
};

const NO: LanguageRules = {
  validShortAnswers: new Set([
    'hei', 'hallo', 'ja', 'nei', 'jo', 'sikkert', 'takk', 'vær', 'vaer', 'så snill',
    'bra', 'dårlig', 'darlig', 'riktig', 'feil', 'kanskje', 'sannsynligvis',
    'klar', 'ferdig', 'vent', 'fortsett', 'gjenta', 'igjen', 'neste', 'hjelp',
    'hopp', 'over', 'mer', 'vanskeligere', 'lettere',
    'forstått', 'forstatt', 'absolutt', 'interessant',
    'ha det', 'hadet', 'farvel',
  ]),
  nonLexicalNoiseRegex: /^(øh+|oh+|hm+|liksom|altså|altsa)$/i,
  goodbyePhrases: [
    'sees senere', 'vi sees', 'i morgen',
    'jeg må gå', 'jeg ma ga', 'jeg må stikke',
    'avslutt økten', 'avslutt okten', 'avslutt', 'stopp',
    'det er alt', 'vi er ferdige',
    'god natt',
    'ha det', 'hadet', 'farvel',
  ],
  singleTokenGoodbyes: new Set(['farvel']),
  greetingPrefixes: [
    'hei', 'hallo', 'god morgen', 'god dag', 'god kveld', 'hvordan',
  ],
};

const FI: LanguageRules = {
  validShortAnswers: new Set([
    'hei', 'moi', 'terve', 'kyllä', 'kylla', 'ei', 'joo', 'varma', 'kiitos',
    'ole', 'hyvä', 'hyva', 'huono', 'oikein', 'väärin', 'vaarin', 'ehkä', 'ehka',
    'todennäköisesti', 'todennakoisesti', 'valmis', 'odota', 'jatka', 'toista',
    'uudelleen', 'seuraava', 'apua', 'ohita', 'enemmän', 'enemman',
    'vaikeampi', 'helpompi',
    'ymmärrän', 'ymmarran', 'ehdottomasti', 'mielenkiintoinen',
    'näkemiin', 'nakemiin', 'hei hei',
  ]),
  nonLexicalNoiseRegex: /^(öh+|oh+|äh+|aah+|hmm+|niinku|tota)$/i,
  goodbyePhrases: [
    'nähdään', 'nahdaan', 'huomenna', 'myöhemmin', 'myohemmin',
    'minun täytyy lähteä', 'minun taytyy lahtea', 'mun pitää mennä', 'mun pitaa menna',
    'lopeta istunto', 'lopeta', 'pysähdy', 'pysahdy',
    'siinä kaikki', 'siina kaikki', 'olemme valmiit',
    'hyvää yötä', 'hyvaa yota',
    'näkemiin', 'nakemiin', 'hei hei', 'moikka',
  ],
  singleTokenGoodbyes: new Set(['näkemiin', 'nakemiin', 'moikka']),
  greetingPrefixes: [
    'hei', 'moi', 'terve', 'hyvää', 'hyvaa', 'mitä', 'mita', 'miten',
  ],
};

const VI: LanguageRules = {
  validShortAnswers: new Set([
    'xin chào', 'xin chao', 'chào', 'chao', 'vâng', 'vang', 'có', 'co', 'không', 'khong',
    'dạ', 'da', 'cảm ơn', 'cam on', 'được', 'duoc', 'tốt', 'tot', 'xấu', 'xau',
    'đúng', 'dung', 'sai', 'có thể', 'co the', 'sẵn sàng', 'san sang',
    'chờ', 'cho', 'tiếp tục', 'tiep tuc', 'lặp lại', 'lap lai',
    'tiếp', 'tiep', 'giúp', 'giup', 'bỏ qua', 'bo qua',
    'hiểu', 'hieu', 'thú vị', 'thu vi',
    'tạm biệt', 'tam biet',
  ]),
  nonLexicalNoiseRegex: /^(à+|a+|ờ+|o+|ừ+|u+|hmm+)$/i,
  goodbyePhrases: [
    'hẹn gặp lại', 'hen gap lai', 'mai gặp', 'mai gap',
    'tôi phải đi', 'toi phai di', 'mình phải đi', 'minh phai di',
    'kết thúc phiên', 'ket thuc phien', 'dừng lại', 'dung lai',
    'thế thôi', 'the thoi', 'xong rồi', 'xong roi',
    'chúc ngủ ngon', 'chuc ngu ngon',
    'tạm biệt', 'tam biet', 'bye',
  ],
  singleTokenGoodbyes: new Set(['bye']),
  greetingPrefixes: [
    'xin chào', 'xin chao', 'chào', 'chao', 'chào bạn', 'chao ban',
    'chào anh', 'chao anh', 'chào chị', 'chao chi',
  ],
};

const TH: LanguageRules = {
  validShortAnswers: new Set([
    'สวัสดี', 'หวัดดี', 'ใช่', 'ไม่', 'ไม่ใช่', 'ครับ', 'ค่ะ', 'แน่นอน',
    'ขอบคุณ', 'ดี', 'แย่', 'ถูก', 'ผิด', 'อาจจะ', 'พร้อม',
    'รอ', 'ต่อ', 'อีกครั้ง', 'ทำซ้ำ', 'ถัดไป', 'ช่วย',
    'ข้าม', 'เพิ่ม', 'ยากขึ้น', 'ง่ายขึ้น',
    'เข้าใจ', 'น่าสนใจ',
    'ลาก่อน', 'บ๊ายบาย',
  ]),
  nonLexicalNoiseRegex: /^(เอ่อ+|อ่า+|อืม+|แบบ|คือ)$/,
  goodbyePhrases: [
    'แล้วเจอกัน', 'เจอกันใหม่', 'พรุ่งนี้เจอกัน',
    'ฉันต้องไปแล้ว', 'ผมต้องไปแล้ว', 'ต้องไปแล้ว',
    'จบเซสชัน', 'จบ', 'หยุด',
    'แค่นี้แหละ', 'เสร็จแล้ว',
    'ราตรีสวัสดิ์',
    'ลาก่อน', 'บ๊ายบาย', 'บาย',
  ],
  singleTokenGoodbyes: new Set(['ลาก่อน', 'บ๊ายบาย', 'บาย']),
  greetingPrefixes: [
    'สวัสดี', 'หวัดดี', 'อรุณสวัสดิ์', 'สบายดี',
  ],
};

const ID: LanguageRules = {
  validShortAnswers: new Set([
    'halo', 'hai', 'ya', 'tidak', 'gak', 'ngga', 'tentu', 'terima kasih', 'makasih',
    'bagus', 'buruk', 'benar', 'salah', 'mungkin', 'siap',
    'tunggu', 'lanjut', 'ulangi', 'lagi', 'selanjutnya', 'tolong',
    'lewati', 'lebih', 'sulit', 'mudah',
    'paham', 'mengerti', 'tentu saja', 'menarik',
    'selamat tinggal', 'sampai jumpa', 'dah',
  ]),
  nonLexicalNoiseRegex: /^(eh+|emm+|um+|hmm+|gitu|kayak)$/i,
  goodbyePhrases: [
    'sampai jumpa', 'sampai nanti', 'sampai besok', 'ketemu lagi',
    'saya harus pergi', 'aku harus pergi', 'saya pergi dulu',
    'akhiri sesi', 'akhiri', 'berhenti',
    'itu saja', 'sudah selesai', 'sudah cukup',
    'selamat malam', 'selamat tidur',
    'selamat tinggal', 'dadah',
  ],
  singleTokenGoodbyes: new Set(['dadah', 'dah']),
  greetingPrefixes: [
    'halo', 'hai', 'selamat pagi', 'selamat siang', 'selamat sore',
    'selamat malam', 'apa kabar',
  ],
};

// ────────────────────────────────────────────────────────────────────────
// TIER 3 — Swahili, Yoruba, Hausa (Deepgram 'multi' STT)
// Minimal data — enough to navigate sessions, won't trigger false drops.
// ────────────────────────────────────────────────────────────────────────

const SW: LanguageRules = {
  validShortAnswers: new Set([
    'habari', 'jambo', 'ndio', 'ndiyo', 'hapana', 'la', 'sawa', 'asante',
    'karibu', 'vizuri', 'mbaya', 'kweli', 'uongo', 'labda', 'tayari',
    'subiri', 'endelea', 'rudia', 'tena', 'msaada', 'ruka',
    'zaidi', 'nyepesi', 'ngumu',
    'kwaheri',
  ]),
  nonLexicalNoiseRegex: /^(ehh+|ah+|hmm+|yaani)$/i,
  goodbyePhrases: [
    'tutaonana', 'kesho', 'baadaye',
    'lazima niende', 'sina budi kuondoka',
    'maliza kikao', 'simama',
    'ndio hivyo', 'tumemaliza',
    'usiku mwema',
    'kwaheri',
  ],
  singleTokenGoodbyes: new Set(['kwaheri']),
  greetingPrefixes: [
    'habari', 'jambo', 'hujambo', 'mambo',
  ],
};

const YO: LanguageRules = {
  validShortAnswers: new Set([
    'bawo', 'báwo', 'beeni', 'béẹni', 'rara', 'rárá', 'oo', 'óò', 'dára', 'buburu',
    'o', 'ó', 'duro', 'tẹsiwaju', 'tẹ̀síwájú', 'tun', 'iranlọwọ',
    'fo', 'siwaju', 'sí iwájú',
    'odabo', 'ó dàbọ̀',
  ]),
  nonLexicalNoiseRegex: /^(ehn+|ahn+|hmm+|kini)$/i,
  goodbyePhrases: [
    'a o tun pade', 'mo ni lati lo', 'mo gbọdọ lọ',
    'pari igba', 'duro',
    'iyẹn ni', 'a ti pari',
    'oorun rere',
    'odabo', 'ó dàbọ̀', 'bye',
  ],
  singleTokenGoodbyes: new Set(['odabo']),
  greetingPrefixes: [
    'bawo', 'báwo', 'ẹ kaaro', 'e kaaro', 'ẹ kaasan', 'e kaasan',
  ],
};

const HA: LanguageRules = {
  validShortAnswers: new Set([
    'sannu', 'barka', 'eh', "a'a", 'aa', 'tabbas', 'na gode',
    'da kyau', 'mara kyau', 'gaskiya', 'karya', 'watakila',
    'jira', 'ci', 'gaba', 'maimaita', 'kuma', 'taimako',
    'tsallake', 'fiye', 'mai wuya', 'mai sauki',
    'sai anjima', 'sai wani lokaci',
  ]),
  nonLexicalNoiseRegex: /^(eh+|ah+|hmm+|kamar)$/i,
  goodbyePhrases: [
    'sai anjima', 'sai wani lokaci', 'sai gobe',
    'dole in tafi', 'zan tafi',
    'kammala zama', 'tsaya', 'dakata',
    'shi ke nan', 'mun gama',
    'dare mai dadi',
    'sai',
  ],
  singleTokenGoodbyes: new Set([]),
  greetingPrefixes: [
    'sannu', 'barka', 'ina kwana', 'ina wuni',
  ],
};

// ────────────────────────────────────────────────────────────────────────
// Registry + fallback
// ────────────────────────────────────────────────────────────────────────

const REGISTRY: Record<LanguageCode, LanguageRules> = {
  en: EN, es: ES, fr: FR, de: DE, it: IT, pt: PT, nl: NL,
  ja: JA, ko: KO, zh: ZH, ru: RU, ar: AR, hi: HI,
  tr: TR, pl: PL, sv: SV, da: DA, no: NO, fi: FI,
  vi: VI, th: TH, id: ID,
  sw: SW, yo: YO, ha: HA,
};

/**
 * Resolve the rule set for a language code. Unknown codes fall back to
 * English rules — the same defensive default as the rest of the JIE
 * voice pipeline (Deepgram language resolution, system-prompt language
 * directive). An unknown code here indicates a code path that didn't go
 * through the SUPPORTED_LANGUAGES validation, which would be a server-
 * side bug — but defaulting to English keeps the session usable rather
 * than throwing.
 */
export function getLanguageRules(code: string | null | undefined): LanguageRules {
  if (!code) return EN;
  const rules = REGISTRY[code as LanguageCode];
  return rules ?? EN;
}

// ────────────────────────────────────────────────────────────────────────
// Unicode-aware text helpers (used by gate code in custom-voice-ws.ts)
// ────────────────────────────────────────────────────────────────────────

/**
 * Normalize a transcript for gating logic. Preserves letters from EVERY
 * Unicode script (Latin, Greek, Cyrillic, Hebrew, Arabic, Devanagari,
 * CJK ideographs, Hangul, Hiragana/Katakana, Thai, etc.) plus apostrophes
 * and whitespace, lowercased.
 *
 * The legacy `[^a-z'\s]` pattern would strip every non-ASCII letter — for
 * Japanese/Korean/Chinese/Arabic users it would leave 一文字も残らない
 * (literally "not a single character remains"). `\p{L}` with the /u flag
 * is the correct Unicode-aware equivalent. JIE's existing gate uses a
 * more conservative `[.,!?]` strip which already preserved non-Latin
 * letters, so this helper is forward-compatible with both call patterns.
 */
export function normalizeForGating(text: string): {
  normalized: string;
  words: string[];
  wordCount: number;
} {
  const normalized = text.trim().toLowerCase().replace(new RegExp("[^\\p{L}'\\s]", 'gu'), '');
  const words = normalized.split(/\s+/).filter((w) => w.length > 0);
  return { normalized, words, wordCount: words.length };
}

/**
 * True if the text contains any letter outside the Latin script.
 *
 * Used by the min-word gate to decide whether word-count thresholds make
 * sense. CJK and Thai don't use spaces between morphemes the way English
 * does, so `wordCount < 3` is meaningless there — a complete Japanese
 * sentence often parses as wordCount=1 by `\s+` split. For those scripts
 * the gate trusts the transcript directly and relies on Deepgram's
 * language-specific confidence to filter noise.
 */
export function isNonLatinScript(text: string): boolean {
  // Strip whitespace, punctuation, numbers, and all Latin-script letters.
  // If any letter remains, the text contains non-Latin content.
  const remaining = text.replace(new RegExp('[\\p{Script=Latin}\\s\\p{P}\\p{N}]', 'gu'), '');
  return new RegExp('\\p{L}', 'u').test(remaining);
}

/**
 * Escape regex metacharacters so phrases like "that's all" or "c'est tout"
 * compile cleanly in a constructed RegExp.
 */
export function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
