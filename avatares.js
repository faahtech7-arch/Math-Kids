/*
  =========================================================================
  Math Kids — Rostinhos dos avatares pré-definidos (Sistema de identificação
  por avatares). Nenhuma imagem real de criança é usada: são SVGs gerados.
  =========================================================================
*/
export function faceSVG(type, color, accent){
  const common = `viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" stroke="#14141A" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"`;
  const shapes = {
    cat: `<circle cx="50" cy="52" r="34" fill="${color}"/>
          <path d="M22 30 L34 46 L18 46 Z" fill="${color}"/>
          <path d="M78 30 L66 46 L82 46 Z" fill="${color}"/>
          <circle cx="38" cy="52" r="4.5" fill="#1F2A44"/>
          <circle cx="62" cy="52" r="4.5" fill="#1F2A44"/>
          <path d="M42 66 Q50 72 58 66" stroke="#1F2A44" stroke-width="3" fill="none" stroke-linecap="round"/>
          <circle cx="30" cy="60" r="4" fill="${accent}" opacity="0.6"/>
          <circle cx="70" cy="60" r="4" fill="${accent}" opacity="0.6"/>`,
    robot: `<rect x="20" y="24" width="60" height="52" rx="16" fill="${color}"/>
          <rect x="44" y="10" width="12" height="14" rx="4" fill="${accent}"/>
          <circle cx="50" cy="12" r="5" fill="${accent}"/>
          <rect x="34" y="44" width="12" height="12" rx="3" fill="#1F2A44"/>
          <rect x="54" y="44" width="12" height="12" rx="3" fill="#1F2A44"/>
          <rect x="38" y="64" width="24" height="6" rx="3" fill="#1F2A44"/>`,
    fox: `<path d="M50 20 L68 44 L50 58 L32 44 Z" fill="${color}"/>
          <circle cx="50" cy="58" r="26" fill="${color}"/>
          <circle cx="40" cy="56" r="4" fill="#1F2A44"/>
          <circle cx="60" cy="56" r="4" fill="#1F2A44"/>
          <path d="M46 68 L50 72 L54 68 Z" fill="${accent}"/>
          <path d="M42 74 Q50 78 58 74" stroke="#1F2A44" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    owl: `<circle cx="50" cy="54" r="34" fill="${color}"/>
          <circle cx="38" cy="48" r="13" fill="#fff"/>
          <circle cx="62" cy="48" r="13" fill="#fff"/>
          <circle cx="38" cy="48" r="6" fill="#1F2A44"/>
          <circle cx="62" cy="48" r="6" fill="#1F2A44"/>
          <path d="M50 54 L46 62 L54 62 Z" fill="${accent}"/>
          <path d="M28 30 L38 38" stroke="${accent}" stroke-width="4" stroke-linecap="round"/>
          <path d="M72 30 L62 38" stroke="${accent}" stroke-width="4" stroke-linecap="round"/>`,
    bunny: `<ellipse cx="36" cy="20" rx="8" ry="20" fill="${color}"/>
          <ellipse cx="64" cy="20" rx="8" ry="20" fill="${color}"/>
          <circle cx="50" cy="56" r="30" fill="${color}"/>
          <circle cx="40" cy="54" r="4" fill="#1F2A44"/>
          <circle cx="60" cy="54" r="4" fill="#1F2A44"/>
          <path d="M44 66 Q50 70 56 66" stroke="#1F2A44" stroke-width="3" fill="none" stroke-linecap="round"/>
          <circle cx="32" cy="62" r="4" fill="${accent}" opacity="0.6"/>
          <circle cx="68" cy="62" r="4" fill="${accent}" opacity="0.6"/>`,
    bear: `<circle cx="26" cy="28" r="11" fill="${color}"/>
          <circle cx="74" cy="28" r="11" fill="${color}"/>
          <circle cx="50" cy="56" r="32" fill="${color}"/>
          <circle cx="40" cy="56" r="4" fill="#1F2A44"/>
          <circle cx="60" cy="56" r="4" fill="#1F2A44"/>
          <ellipse cx="50" cy="66" rx="9" ry="6" fill="${accent}"/>
          <circle cx="50" cy="62" r="3" fill="#1F2A44"/>`,
    dino: `<path d="M22 78 Q18 50 34 34 Q30 22 40 14 Q44 22 46 26
             Q56 18 66 26 Q70 18 78 20 Q74 28 70 32
             Q80 40 78 54 Q90 56 90 66 L78 64
             Q76 74 66 78 L66 66 Q56 70 46 66 L44 78 L36 78 L38 64
             Q28 62 22 78 Z" fill="${color}"/>
          <path d="M40 16 L44 26 L36 24 Z" fill="${accent}"/>
          <path d="M52 20 L56 30 L48 28 Z" fill="${accent}"/>
          <path d="M64 22 L68 32 L60 30 Z" fill="${accent}"/>
          <circle cx="66" cy="40" r="4" fill="#1F2A44"/>
          <path d="M72 46 Q78 48 80 44" stroke="#1F2A44" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
    rocket: `<path d="M50 8 Q68 26 66 56 L34 56 Q32 26 50 8 Z" fill="${color}"/>
          <circle cx="50" cy="38" r="9" fill="#fff"/>
          <circle cx="50" cy="38" r="4.5" fill="${accent}"/>
          <path d="M34 44 Q18 50 16 68 Q28 62 36 56 Z" fill="${accent}"/>
          <path d="M66 44 Q82 50 84 68 Q72 62 64 56 Z" fill="${accent}"/>
          <path d="M40 56 L60 56 L56 74 L44 74 Z" fill="${color}"/>
          <path d="M44 74 L50 92 L56 74 Z" fill="#FFB627"/>
          <path d="M47 74 L50 84 L53 74 Z" fill="#FF6F61"/>`,
    star: `<path d="M50 10 L61 38 L91 40 L67 59 L76 89
             L50 71 L24 89 L33 59 L9 40 L39 38 Z" fill="${color}"/>
          <circle cx="42" cy="52" r="4" fill="#1F2A44"/>
          <circle cx="60" cy="52" r="4" fill="#1F2A44"/>
          <path d="M43 62 Q51 68 59 62" stroke="#1F2A44" stroke-width="3" fill="none" stroke-linecap="round"/>
          <circle cx="50" cy="26" r="3" fill="${accent}" opacity="0.7"/>`,
    alien: `<ellipse cx="50" cy="56" rx="30" ry="34" fill="${color}"/>
          <path d="M38 24 Q34 12 24 8" fill="none"/>
          <circle cx="24" cy="8" r="4" fill="${accent}"/>
          <path d="M62 24 Q66 12 76 8" fill="none"/>
          <circle cx="76" cy="8" r="4" fill="${accent}"/>
          <ellipse cx="38" cy="54" rx="9" ry="13" fill="#14141A"/>
          <ellipse cx="62" cy="54" rx="9" ry="13" fill="#14141A"/>
          <circle cx="35" cy="48" r="2.5" fill="#fff"/>
          <circle cx="59" cy="48" r="2.5" fill="#fff"/>
          <path d="M44 76 Q50 80 56 76" stroke="#14141A" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    unicorn: `<path d="M30 42 Q25 70 40 84 L60 84 Q75 70 70 42 Q75 22 58 17 Q50 8 42 17 Q25 22 30 42 Z" fill="${color}"/>
          <path d="M36 20 L29 6 L44 15 Z" fill="${color}"/>
          <path d="M64 20 L71 6 L56 15 Z" fill="${color}"/>
          <path d="M50 4 L57 24 L43 24 Z" fill="#FFD400"/>
          <path d="M28 32 Q18 44 24 60" stroke="${accent}" stroke-width="5" fill="none" stroke-linecap="round"/>
          <path d="M32 26 Q22 40 27 54" stroke="#FF6F91" stroke-width="5" fill="none" stroke-linecap="round"/>
          <path d="M25 40 Q17 50 22 64" stroke="#4CC9F0" stroke-width="5" fill="none" stroke-linecap="round"/>
          <circle cx="42" cy="52" r="4" fill="#14141A"/>
          <circle cx="60" cy="52" r="4" fill="#14141A"/>
          <path d="M44 70 Q51 75 58 70" stroke="#14141A" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    panda: `<circle cx="26" cy="28" r="14" fill="#14141A"/>
          <circle cx="74" cy="28" r="14" fill="#14141A"/>
          <circle cx="50" cy="56" r="32" fill="${color}"/>
          <ellipse cx="39" cy="54" rx="10" ry="13" fill="#14141A"/>
          <ellipse cx="61" cy="54" rx="10" ry="13" fill="#14141A"/>
          <circle cx="39" cy="56" r="3.5" fill="#fff"/>
          <circle cx="61" cy="56" r="3.5" fill="#fff"/>
          <ellipse cx="50" cy="68" rx="4.5" ry="3.5" fill="#14141A"/>
          <path d="M44 74 Q50 78 56 74" stroke="#14141A" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          <circle cx="28" cy="66" r="4" fill="${accent}" opacity="0.7"/>
          <circle cx="72" cy="66" r="4" fill="${accent}" opacity="0.7"/>`,
    shark: `<path d="M18 58 Q28 30 58 30 Q84 32 92 50 Q74 48 62 60 Q52 76 30 74 Q20 70 18 58 Z" fill="${color}"/>
          <path d="M54 30 L61 8 L70 30 Z" fill="${color}"/>
          <path d="M28 72 L20 84 L36 76 Z" fill="${color}"/>
          <circle cx="70" cy="46" r="4" fill="#14141A"/>
          <path d="M74 58 Q84 60 90 55" stroke="#14141A" stroke-width="3" fill="none" stroke-linecap="round"/>
          <path d="M76 58 L79 64 L82 58 Z" fill="#fff"/>
          <path d="M83 57 L86 63 L89 57 Z" fill="#fff"/>`
  };
  return `<svg ${common}>${shapes[type] || shapes.cat}</svg>`;
}
