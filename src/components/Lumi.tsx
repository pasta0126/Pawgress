import "./Lumi.css";

export type EmotionalState = "Excited" | "Happy" | "Neutral" | "Tired";

interface LumiProps {
  emotion: EmotionalState;
  isActive?: boolean;
}

const MOUTH: Record<EmotionalState, string> = {
  Excited: "M88,117 C92,126 108,126 112,117",
  Happy:   "M90,117 C92,123 108,123 110,117",
  Neutral: "M93,117 C95,120 105,120 107,117",
  Tired:   "M91,118 C93,115 107,115 109,118",
};

export default function Lumi({ emotion, isActive = false }: LumiProps) {
  const isTired  = emotion === "Tired";
  const isHappy  = emotion === "Happy" || emotion === "Excited";
  const isExcited = emotion === "Excited";
  const eyeRy    = isTired ? 8 : 16;
  const irisRy   = isTired ? 6 : 14;
  const eyeCy    = isTired ? 90 : 88;

  return (
    <svg
      viewBox="0 0 200 220"
      xmlns="http://www.w3.org/2000/svg"
      className={`lumi-svg lumi-emotion-${emotion.toLowerCase()}${isActive ? " lumi-typing" : ""}`}
      style={{ overflow: "visible" }}
    >
      <defs>
        {/* Glow filters */}
        <filter id="l-antler-glow" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="l-tail-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Head: cream center fading to lavender edges */}
        <radialGradient id="l-head" cx="42%" cy="38%" r="58%">
          <stop offset="0%"   stopColor="#F7E8D6" />
          <stop offset="48%"  stopColor="#CCAAEF" />
          <stop offset="100%" stopColor="#B990F2" />
        </radialGradient>

        {/* Body: lavender */}
        <radialGradient id="l-body" cx="50%" cy="32%" r="62%">
          <stop offset="0%"   stopColor="#C8A4F4" />
          <stop offset="100%" stopColor="#A87DE8" />
        </radialGradient>

        {/* Tail: base lavender → glowing pale violet-white tip */}
        <linearGradient id="l-tail" x1="20%" y1="100%" x2="80%" y2="0%">
          <stop offset="0%"   stopColor="#A87DE8" />
          <stop offset="60%"  stopColor="#D4BAFF" />
          <stop offset="100%" stopColor="#EFE5FF" />
        </linearGradient>

        {/* Iris */}
        <radialGradient id="l-iris" cx="35%" cy="30%" r="65%">
          <stop offset="0%"   stopColor="#8B5FD4" />
          <stop offset="100%" stopColor="#3A245A" />
        </radialGradient>
      </defs>

      {/* ── TAIL (behind body) ── */}
      <ellipse className="tail-glow" cx="158" cy="138" rx="22" ry="30"
        fill="#C8A6FF" fillOpacity="0.22" filter="url(#l-tail-glow)" />
      <path className="tail-shape"
        d="M140,162 C155,148 173,132 171,108 C169,88 154,83 147,96
           C140,110 145,132 149,147 C153,160 148,174 138,171
           C130,168 128,158 135,153 C139,150 140,155 140,162Z"
        fill="url(#l-tail)" />
      <ellipse className="tail-tip" cx="160" cy="97" rx="11" ry="14"
        fill="#EFE5FF" fillOpacity="0.55" filter="url(#l-tail-glow)" />

      {/* ── BODY ── */}
      <ellipse cx="100" cy="168" rx="48" ry="40" fill="url(#l-body)" />
      {/* Belly cream patch */}
      <ellipse cx="100" cy="172" rx="26" ry="22" fill="#F7E8D6" />

      {/* ── LEFT EAR ── */}
      <path d="M68,92 C56,76 44,55 52,40 C58,29 70,37 73,62 C75,74 73,84 68,92Z"
        fill="#C09CF0" />
      <path d="M66,88 C57,74 49,57 55,46 C60,38 68,44 71,65 C73,75 71,83 66,88Z"
        fill="#F3B9D6" />

      {/* ── RIGHT EAR ── */}
      <path d="M132,92 C144,76 156,55 148,40 C142,29 130,37 127,62 C125,74 127,84 132,92Z"
        fill="#C09CF0" />
      <path d="M134,88 C143,74 151,57 145,46 C140,38 132,44 129,65 C127,75 129,83 134,88Z"
        fill="#F3B9D6" />

      {/* ── HEAD ── */}
      <circle cx="100" cy="88" r="52" fill="url(#l-head)" />

      {/* ── ANTLERS ── */}
      <g className="lumi-antlers" filter="url(#l-antler-glow)">
        <path d="M87,48 C84,36 81,22 85,12"
          stroke="#DCC8FF" strokeWidth="5.5" strokeLinecap="round" fill="none" />
        <path d="M84,30 C79,23 72,20 68,22"
          stroke="#DCC8FF" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M113,48 C116,36 119,22 115,12"
          stroke="#DCC8FF" strokeWidth="5.5" strokeLinecap="round" fill="none" />
        <path d="M116,30 C121,23 128,20 132,22"
          stroke="#DCC8FF" strokeWidth="4" strokeLinecap="round" fill="none" />
      </g>

      {/* ── LEFT EYE ── */}
      <g className="lumi-eye lumi-eye-left">
        <ellipse cx="82" cy={eyeCy} rx="14" ry={eyeRy} fill="#1A0A2E" />
        <ellipse cx="82" cy={eyeCy} rx="12" ry={irisRy} fill="url(#l-iris)" />
        {/* Happy squint: cover top arc of eye */}
        {isHappy && (
          <path d="M68,83 C74,75 90,75 96,83" fill="#CCAAEF" />
        )}
        {/* Tired droopy lid */}
        {isTired && (
          <path d="M68,88 C74,83 90,83 96,88" fill="#CCAAEF" />
        )}
        <circle cx="76" cy={isTired ? 88 : 81} r="4.5" fill="white" fillOpacity="0.93" />
        <circle cx="80" cy={isTired ? 91 : 86} r="1.8" fill="white" fillOpacity="0.55" />
      </g>

      {/* ── RIGHT EYE ── */}
      <g className="lumi-eye lumi-eye-right">
        <ellipse cx="118" cy={eyeCy} rx="14" ry={eyeRy} fill="#1A0A2E" />
        <ellipse cx="118" cy={eyeCy} rx="12" ry={irisRy} fill="url(#l-iris)" />
        {isHappy && (
          <path d="M104,83 C110,75 126,75 132,83" fill="#CCAAEF" />
        )}
        {isTired && (
          <path d="M104,88 C110,83 126,83 132,88" fill="#CCAAEF" />
        )}
        <circle cx="112" cy={isTired ? 88 : 81} r="4.5" fill="white" fillOpacity="0.93" />
        <circle cx="116" cy={isTired ? 91 : 86} r="1.8" fill="white" fillOpacity="0.55" />
      </g>

      {/* ── NOSE ── */}
      <path d="M97,108 L100,112 L103,108Z" fill="#7B4E68" />

      {/* ── MOUTH ── */}
      <path d={MOUTH[emotion]} stroke="#6B3E58" strokeWidth="1.8"
        fill="none" strokeLinecap="round" />
      {isExcited && (
        <ellipse cx="100" cy="122" rx="5" ry="3.5" fill="#6B3E58" fillOpacity="0.3" />
      )}

      {/* ── BLUSH ── */}
      <circle cx="67"  cy="100" r="12" fill="#F2A7BD" fillOpacity="0.38" />
      <circle cx="133" cy="100" r="12" fill="#F2A7BD" fillOpacity="0.38" />

      {/* ── FOREHEAD DOTS ── */}
      <circle cx="93"  cy="70" r="2.5" fill="#8D6BD1" fillOpacity="0.6" />
      <circle cx="100" cy="67" r="2.5" fill="#8D6BD1" fillOpacity="0.6" />
      <circle cx="107" cy="70" r="2.5" fill="#8D6BD1" fillOpacity="0.6" />

      {/* ── PAWS ── */}
      <ellipse cx="82"  cy="201" rx="13" ry="8" fill="#C09CF0" />
      <ellipse cx="118" cy="201" rx="13" ry="8" fill="#C09CF0" />

      {/* ── COLLAR ── */}
      <path d="M75,146 C75,153 125,153 125,146"
        stroke="#8E67C7" strokeWidth="3.5" fill="none" strokeLinecap="round" />

      {/* ── STAR PENDANT ── */}
      <g className="lumi-pendant">
        <circle cx="100" cy="158" r="8" fill="#FFD76A" fillOpacity="0.28" />
        <polygon
          points="100,150 102.4,156.4 109,156.4 103.6,160.4 105.8,167 100,163 94.2,167 96.4,160.4 91,156.4 97.6,156.4"
          fill="#FFD76A"
        />
      </g>

      {/* ── EXCITED SPARKLES ── */}
      {isExcited && (
        <g className="lumi-sparkles">
          <path d="M33,72 L35,66 L37,72 L35,78Z"   fill="#F9F1FF" fillOpacity="0.85" />
          <path d="M163,65 L165,59 L167,65 L165,71Z" fill="#F9F1FF" fillOpacity="0.75" />
          <path d="M22,112 L23.5,107 L25,112 L23.5,117Z" fill="#C8A6FF" fillOpacity="0.7" />
          <path d="M175,108 L176.5,103 L178,108 L176.5,113Z" fill="#C8A6FF" fillOpacity="0.65" />
        </g>
      )}
    </svg>
  );
}
