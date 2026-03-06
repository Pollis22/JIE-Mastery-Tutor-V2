import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

// ─── Visual Tag Registry ───────────────────────────────────────────────────
// Add new visuals here. Claude will reference these tag names in responses.
export const VISUAL_TAGS = [
  'math_area_model',
  'math_number_line',
  'math_fractions',
  'math_place_value',
  'math_multiplication_table',
  'writing_paragraph_structure',
  'writing_essay_outline',
  'periodic_table_simplified',
  'grammar_sentence_parts',
  'reading_main_idea',
] as const;

export type VisualTag = typeof VISUAL_TAGS[number];

// ─── Individual Visual Components ─────────────────────────────────────────

function MathAreaModel() {
  return (
    <div className="flex flex-col items-center gap-4 p-2">
      <p className="text-sm font-semibold text-center text-muted-foreground">Area Model: Distributive Property</p>
      <div className="text-center font-mono text-base font-bold">2(x + 11) = 2·x + 2·11</div>
      <div className="flex items-start gap-1">
        {/* Left axis label */}
        <div className="flex flex-col items-center justify-center h-20 mt-6">
          <span className="text-sm font-bold mr-1">2</span>
          <div className="w-px h-16 bg-foreground/60" />
        </div>
        <div className="flex flex-col gap-1">
          {/* Top axis labels */}
          <div className="flex gap-1 pl-1">
            <div className="flex items-center justify-center w-28 text-sm font-semibold">← x →</div>
            <div className="flex items-center justify-center w-20 text-sm font-semibold">← 11 →</div>
          </div>
          {/* Rectangle boxes */}
          <div className="flex gap-1">
            <div className="w-28 h-16 bg-yellow-400/80 border-2 border-yellow-600 rounded flex items-center justify-center">
              <div className="text-center">
                <div className="font-bold text-yellow-900 text-sm">A</div>
                <div className="text-xs text-yellow-800">2 × x = 2x</div>
              </div>
            </div>
            <div className="w-20 h-16 bg-amber-300/80 border-2 border-amber-600 rounded flex items-center justify-center">
              <div className="text-center">
                <div className="font-bold text-amber-900 text-sm">B</div>
                <div className="text-xs text-amber-800">2 × 11 = 22</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="text-center mt-1 p-2 bg-muted rounded-lg">
        <span className="font-bold text-sm">Total Area = 2x + 22</span>
      </div>
      <div className="text-center text-xs text-muted-foreground italic px-2 border border-border rounded p-2 bg-muted/40">
        When you multiply out brackets, multiply <strong>each</strong> term inside by the term outside.
      </div>
    </div>
  );
}

function MathNumberLine() {
  const ticks = [-3, -2, -1, 0, 1, 2, 3];
  return (
    <div className="flex flex-col items-center gap-4 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Number Line</p>
      <div className="relative w-full flex items-center justify-center">
        <div className="flex items-center gap-0">
          <div className="w-4 h-px bg-foreground/60" />
          <div className="text-foreground/60 text-xs">←</div>
          {ticks.map((n) => (
            <div key={n} className="flex flex-col items-center">
              <div className="w-10 h-px bg-foreground/60" />
              <div className={`w-px h-3 ${n === 0 ? 'h-5 bg-foreground' : 'bg-foreground/60'}`} />
              <span className={`text-xs mt-1 ${n === 0 ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{n}</span>
            </div>
          ))}
          <div className="text-foreground/60 text-xs">→</div>
          <div className="w-4 h-px bg-foreground/60" />
        </div>
      </div>
      <div className="text-xs text-muted-foreground text-center">Negative ← Zero → Positive</div>
    </div>
  );
}

function MathFractions() {
  return (
    <div className="flex flex-col items-center gap-4 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Fraction Bars</p>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {[
          { label: '1 Whole', parts: 1, color: 'bg-blue-400' },
          { label: '1/2', parts: 2, color: 'bg-green-400' },
          { label: '1/4', parts: 4, color: 'bg-yellow-400' },
          { label: '1/8', parts: 8, color: 'bg-orange-400' },
        ].map(({ label, parts, color }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-xs font-semibold w-10 text-right">{label}</span>
            <div className="flex flex-1 gap-px border border-border rounded overflow-hidden">
              {Array.from({ length: parts }).map((_, i) => (
                <div key={i} className={`${color} h-7 flex-1 opacity-80 border-r border-white/30 last:border-0 flex items-center justify-center`}>
                  <span className="text-white text-xs font-bold" style={{ fontSize: '9px' }}>
                    {parts > 1 ? `1/${parts}` : '1'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MathPlaceValue() {
  const columns = [
    { label: 'Thousands', value: '1,000', color: 'bg-purple-400' },
    { label: 'Hundreds', value: '100', color: 'bg-blue-400' },
    { label: 'Tens', value: '10', color: 'bg-green-400' },
    { label: 'Ones', value: '1', color: 'bg-yellow-400' },
  ];
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Place Value Chart</p>
      <div className="flex gap-1">
        {columns.map(({ label, value, color }) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <div className={`${color} rounded-t px-2 py-1 text-center`}>
              <div className="text-white text-xs font-bold">{label}</div>
            </div>
            <div className="border border-border w-16 h-12 flex items-center justify-center bg-muted rounded-b">
              <span className="font-mono text-sm font-bold">{value}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground text-center">Each place is 10× the one to its right</div>
    </div>
  );
}

function MathMultiplicationTable() {
  const size = 6;
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Multiplication Table (1–{size})</p>
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="w-7 h-7 bg-muted text-muted-foreground font-bold">×</th>
            {Array.from({ length: size }, (_, i) => (
              <th key={i} className="w-7 h-7 bg-blue-100 dark:bg-blue-900/40 text-center font-bold">{i + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: size }, (_, row) => (
            <tr key={row}>
              <td className="w-7 h-7 bg-blue-100 dark:bg-blue-900/40 text-center font-bold">{row + 1}</td>
              {Array.from({ length: size }, (_, col) => (
                <td key={col} className={`w-7 h-7 text-center border border-border/40 ${(row + 1) === (col + 1) ? 'bg-yellow-200 dark:bg-yellow-800/40 font-bold' : 'bg-background'}`}>
                  {(row + 1) * (col + 1)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WritingParagraphStructure() {
  const parts = [
    { label: 'Topic Sentence', desc: 'States the main idea', color: 'bg-blue-500', width: 'w-full' },
    { label: 'Supporting Detail 1', desc: 'Evidence or example', color: 'bg-green-400', width: 'w-5/6' },
    { label: 'Supporting Detail 2', desc: 'Evidence or example', color: 'bg-green-400', width: 'w-5/6' },
    { label: 'Supporting Detail 3', desc: 'Evidence or example', color: 'bg-green-400', width: 'w-5/6' },
    { label: 'Concluding Sentence', desc: 'Wraps up the paragraph', color: 'bg-blue-500', width: 'w-full' },
  ];
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Paragraph Structure</p>
      <div className="flex flex-col gap-1.5 w-full">
        {parts.map(({ label, desc, color, width }) => (
          <div key={label} className={`${width} mx-auto`}>
            <div className={`${color} text-white rounded px-2 py-1.5 flex justify-between items-center`}>
              <span className="text-xs font-bold">{label}</span>
              <span className="text-xs opacity-80">{desc}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WritingEssayOutline() {
  const sections = [
    { label: 'Introduction', items: ['Hook', 'Background', 'Thesis Statement'], color: 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' },
    { label: 'Body Paragraph 1', items: ['Topic Sentence', 'Evidence', 'Analysis'], color: 'border-green-500 bg-green-50 dark:bg-green-950/30' },
    { label: 'Body Paragraph 2', items: ['Topic Sentence', 'Evidence', 'Analysis'], color: 'border-green-500 bg-green-50 dark:bg-green-950/30' },
    { label: 'Conclusion', items: ['Restate Thesis', 'Summary', 'Closing Thought'], color: 'border-purple-500 bg-purple-50 dark:bg-purple-950/30' },
  ];
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <p className="text-sm font-semibold text-muted-foreground text-center">Essay Outline</p>
      {sections.map(({ label, items, color }) => (
        <div key={label} className={`border-l-4 ${color} rounded-r px-2 py-1`}>
          <div className="text-xs font-bold mb-0.5">{label}</div>
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
            {items.map(item => (
              <li key={item} className="text-xs text-muted-foreground">• {item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function PeriodicTableSimplified() {
  const elements = [
    { sym: 'H', name: 'Hydrogen', num: 1, color: 'bg-pink-200 dark:bg-pink-900/50' },
    { sym: 'He', name: 'Helium', num: 2, color: 'bg-purple-200 dark:bg-purple-900/50' },
    { sym: 'Li', name: 'Lithium', num: 3, color: 'bg-red-200 dark:bg-red-900/50' },
    { sym: 'C', name: 'Carbon', num: 6, color: 'bg-gray-200 dark:bg-gray-700/50' },
    { sym: 'N', name: 'Nitrogen', num: 7, color: 'bg-blue-200 dark:bg-blue-900/50' },
    { sym: 'O', name: 'Oxygen', num: 8, color: 'bg-blue-200 dark:bg-blue-900/50' },
    { sym: 'Na', name: 'Sodium', num: 11, color: 'bg-red-200 dark:bg-red-900/50' },
    { sym: 'Fe', name: 'Iron', num: 26, color: 'bg-orange-200 dark:bg-orange-900/50' },
    { sym: 'Au', name: 'Gold', num: 79, color: 'bg-yellow-200 dark:bg-yellow-900/50' },
  ];
  return (
    <div className="flex flex-col items-center gap-2 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Common Elements</p>
      <div className="grid grid-cols-3 gap-1.5">
        {elements.map(({ sym, name, num, color }) => (
          <div key={sym} className={`${color} border border-border rounded p-1 text-center w-20`}>
            <div className="text-xs text-muted-foreground">{num}</div>
            <div className="text-lg font-bold leading-tight">{sym}</div>
            <div className="text-xs text-muted-foreground truncate">{name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GrammarSentenceParts() {
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Parts of a Sentence</p>
      <div className="bg-muted rounded-lg p-3 w-full text-center">
        <p className="text-base font-bold">
          <span className="text-blue-600 dark:text-blue-400">The dog</span>{' '}
          <span className="text-green-600 dark:text-green-400">quickly ran</span>{' '}
          <span className="text-orange-600 dark:text-orange-400">to the park</span>
          <span className="text-foreground">.</span>
        </p>
      </div>
      <div className="flex gap-3 text-xs">
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-500" /><span><strong>Subject</strong> — who/what</span></div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-500" /><span><strong>Predicate</strong> — the action</span></div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-orange-500" /><span><strong>Object/Phrase</strong></span></div>
      </div>
      <div className="grid grid-cols-2 gap-2 w-full text-xs">
        {[
          { label: 'Noun', desc: 'person, place, thing', ex: 'dog, city, love' },
          { label: 'Verb', desc: 'action or state', ex: 'run, is, think' },
          { label: 'Adjective', desc: 'describes a noun', ex: 'big, red, fast' },
          { label: 'Adverb', desc: 'describes a verb', ex: 'quickly, very' },
        ].map(({ label, desc, ex }) => (
          <div key={label} className="border border-border rounded p-1.5 bg-muted/40">
            <div className="font-bold">{label}</div>
            <div className="text-muted-foreground">{desc}</div>
            <div className="italic text-xs">{ex}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReadingMainIdea() {
  return (
    <div className="flex flex-col items-center gap-3 p-2">
      <p className="text-sm font-semibold text-muted-foreground">Finding the Main Idea</p>
      <div className="relative flex flex-col items-center gap-1 w-full">
        <div className="bg-blue-500 text-white rounded-full px-4 py-2 text-sm font-bold text-center z-10">
          Main Idea
        </div>
        <div className="w-px h-4 bg-foreground/40" />
        <div className="grid grid-cols-3 gap-2 w-full">
          {['Detail 1', 'Detail 2', 'Detail 3'].map((d) => (
            <div key={d} className="flex flex-col items-center gap-1">
              <div className="w-px h-3 bg-foreground/40" />
              <div className="bg-green-400/80 text-green-900 dark:text-green-100 rounded px-2 py-1 text-xs font-semibold text-center">{d}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="text-xs text-muted-foreground text-center bg-muted rounded p-2">
        <strong>Ask yourself:</strong> What is this mostly about? The details support the main idea.
      </div>
    </div>
  );
}

// ─── Visual Renderer ───────────────────────────────────────────────────────

function renderVisual(tag: VisualTag) {
  switch (tag) {
    case 'math_area_model': return <MathAreaModel />;
    case 'math_number_line': return <MathNumberLine />;
    case 'math_fractions': return <MathFractions />;
    case 'math_place_value': return <MathPlaceValue />;
    case 'math_multiplication_table': return <MathMultiplicationTable />;
    case 'writing_paragraph_structure': return <WritingParagraphStructure />;
    case 'writing_essay_outline': return <WritingEssayOutline />;
    case 'periodic_table_simplified': return <PeriodicTableSimplified />;
    case 'grammar_sentence_parts': return <GrammarSentenceParts />;
    case 'reading_main_idea': return <ReadingMainIdea />;
    default: return null;
  }
}

const VISUAL_LABELS: Record<VisualTag, string> = {
  math_area_model: 'Area Model',
  math_number_line: 'Number Line',
  math_fractions: 'Fraction Bars',
  math_place_value: 'Place Value Chart',
  math_multiplication_table: 'Multiplication Table',
  writing_paragraph_structure: 'Paragraph Structure',
  writing_essay_outline: 'Essay Outline',
  periodic_table_simplified: 'Common Elements',
  grammar_sentence_parts: 'Sentence Parts',
  reading_main_idea: 'Main Idea Map',
};

// ─── VisualPanel Component ─────────────────────────────────────────────────

interface VisualPanelProps {
  visualTag: VisualTag | null;
  onDismiss: () => void;
}

export function VisualPanel({ visualTag, onDismiss }: VisualPanelProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visualTag) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [visualTag]);

  if (!visualTag || !visible) return null;

  const label = VISUAL_LABELS[visualTag] ?? visualTag;
  const content = renderVisual(visualTag);
  if (!content) return null;

  return (
    <div className="mx-2 mb-3 border border-border rounded-xl bg-background shadow-md overflow-hidden animate-in slide-in-from-top-2 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/60 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">📊 Visual Aid</span>
          <span className="text-sm font-bold text-foreground">{label}</span>
        </div>
        <button
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss visual"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {/* Content */}
      <div className="p-3 overflow-x-auto">
        {content}
      </div>
    </div>
  );
}
