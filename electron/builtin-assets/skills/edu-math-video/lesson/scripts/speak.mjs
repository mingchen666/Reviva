// Converts board/subtitle text into something the TTS reads naturally:
// letters are spelled out one by one, math symbols become words.
const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
const SYM = [
  ['∥', '平行于'], ['//', '平行于'], ['⊥', '垂直于'], ['∴', '所以'], ['∵', '因为'], ['△', '三角形'], ['∠', '角'],
  ['°', '度'], ['≠', '不等于'], ['≤', '小于等于'], ['≥', '大于等于'], ['⊄', '不在'], ['⊂', '在'], ['∈', '属于'], ['∉', '不属于'],
  ['∩', '交'], ['∪', '并'], ['√', '根号'], ['π', '派'], ['⇒', '，所以'], ['⇔', '等价于'], ['→', '，得到'], ['×', '乘'], ['÷', '除以'],
  ['−', '减'], ['±', '正负'], ['≈', '约等于'], ['²', '的平方'], ['³', '的立方'], ['=', '等于'], ['+', '加'], ['<', '小于'], ['>', '大于'],
  ['——', '，'], ['…', '，'], ['′', '撇'],
];

// pronunciation markup 当[dāng] / 长[chang2] (shared/pron.py syntax): kept for TTS, removed from captions
export const stripPron = (s) => String(s).replace(/(\S)\[[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüv:]+[1-5]?\]/g, '$1');

const spell = (s) => ` ${s.replace(/[₀-₉]/g, (c) => SUB[c]).split('').join(' ')} `;

export function toSpeak(say) {
  let s = String(say)
    .replace(/\$[^$]*\$/g, ' ')
    .replace(/\{([^{}]+)\}/g, (_, x) => spell(x.replace(/'/g, '′')))
    .replace(/\*\*|==|!!/g, '');
  // capital-letter groups (DE, BCC₁B₁, A1) are spelled letter by letter
  s = s.replace(/[A-Z](?:[A-Z0-9₀-₉′])*/g, (m) => spell(m));
  for (const [a, b] of SYM) s = s.split(a).join(b);
  return s.replace(/\s+/g, ' ').replace(/ ([，。、；：！？）])/g, '$1').replace(/([（]) /g, '$1').trim();
}
