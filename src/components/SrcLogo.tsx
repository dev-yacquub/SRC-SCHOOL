import type { SVGProps } from "react";

const BLUE = "#1945C0";
const GOLD = "#F2C003";
const WHITE = "#FFFFFF";

const FLAME_OUTER =
  "M0,0 C-17,-7 -21,-30 -12,-50 C-7,-61 -2,-70 0,-77 C3,-68 5,-59 4,-50 C8,-55 11,-61 12,-67 C20,-48 22,-22 10,-6 C7,-2 3,0 0,0 Z";
const FLAME_MID =
  "M0,-8 C-9,-13 -11,-27 -6,-41 C-3,-47 -1,-52 0,-57 C3,-49 4,-42 3,-36 C5,-40 7,-44 8,-48 C12,-35 13,-19 6,-10 C4,-8 2,-7 0,-8 Z";
const FLAME_CORE =
  "M0,-14 C-4,-18 -5,-26 -2,-34 C0,-39 1,-42 2,-44 C4,-37 6,-26 4,-18 C3,-15 1,-14 0,-14 Z";

const WISP_OUTER =
  "M0,0 C-9,-5 -10,-19 -4,-31 C-1,-37 1,-41 1,-45 C5,-37 8,-26 5,-16 C4,-8 2,-3 0,0 Z";
const WISP_MID =
  "M0,-6 C-4,-9 -5,-17 -2,-25 C0,-29 1,-32 1,-34 C4,-28 4,-19 3,-12 C2,-8 1,-6 0,-6 Z";
const WISP_CORE =
  "M0,-10 C-2,-13 -2,-18 0,-22 C2,-18 2,-13 0,-10 Z";

const MAIN_FLAMES: Array<{ transform: string }> = [
  { transform: "rotate(-50) translate(0 -57) scale(0.84)" },
  { transform: "rotate(-24) translate(0 -56) scale(0.95)" },
  { transform: "rotate(0) translate(0 -56) scale(1.04)" },
  { transform: "rotate(24) translate(0 -56) scale(0.95)" },
  { transform: "rotate(50) translate(0 -57) scale(0.84)" },
];

const SIDE_WISPS: Array<{ transform: string }> = [
  { transform: "translate(-100 -42) rotate(-66) scale(0.7)" },
  { transform: "translate(100 -42) rotate(66) scale(0.7)" },
];

type SrcLogoProps = SVGProps<SVGSVGElement> & {
  /** Rendered width/height in px (square). Defaults to 120. */
  size?: number | string;
};

/** SRC school crest ("Your future is our Mission") on a transparent circular background. */
export default function SrcLogo({ size = 120, ...props }: SrcLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 448 448"
      width={size}
      height={size}
      role="img"
      aria-label="SRC – Your future is our Mission"
      {...props}
    >
      {/* Outer circular crest rings */}
      <circle cx="224" cy="224" r="222" fill={BLUE} />
      <circle cx="224" cy="224" r="212" fill={GOLD} />
      <circle cx="224" cy="224" r="199" fill={WHITE} />

      {/* Sun rays / flames above sun dome */}
      <g transform="translate(224 174)">
        {SIDE_WISPS.map((w) => (
          <g key={w.transform} transform={w.transform}>
            <path d={WISP_OUTER} fill={BLUE} />
            <path d={WISP_MID} fill={WHITE} />
            <path d={WISP_CORE} fill={BLUE} />
          </g>
        ))}
        {MAIN_FLAMES.map((f) => (
          <g key={f.transform} transform={f.transform}>
            <path d={FLAME_OUTER} fill={BLUE} />
            <path d={FLAME_MID} fill={WHITE} />
            <path d={FLAME_CORE} fill={BLUE} />
          </g>
        ))}
      </g>

      {/* Sun dome */}
      <circle cx="224" cy="174" r="54" fill={BLUE} />

      {/* Shield body with flared top horns */}
      <path
        d="M80,141 C98,142 114,146 132,148 L316,148 C334,146 350,142 368,141 C363,149 361,156 361,166 C359,258 345,356 224,417 C103,356 94,258 94,166 C94,156 90,149 80,141 Z"
        fill={BLUE}
      />

      {/* White swoosh slicing diagonally across shield */}
      <path
        d="M92,265 C155,278 262,262 340,200 C284,274 176,314 100,305 Z"
        fill={WHITE}
      />

      {/* Custom vector SRC emblem with blue outline halo */}
      <g
        fill={WHITE}
        stroke={BLUE}
        strokeWidth={6}
        strokeLinejoin="round"
        paintOrder="stroke"
      >
        {/* S */}
        <path d="M112,150 L180,150 L177,161 L123,161 C119,161 118,164 118,166 C118,168 120,170 124,170 L165,170 C175,170 179,175 177,185 C175,194 169,199 158,199 L97,199 L102,188 L155,188 C159,188 161,185 161,183 C161,180 159,179 154,179 L112,179 C102,179 98,173 100,164 C102,155 106,150 112,150 Z" />
        {/* R */}
        <path d="M196,150 L258,150 C271,150 276,157 273,166 C271,173 265,178 256,180 L264,199 L241,199 L235,181 L219,181 L170,231 L199,198 L187,198 L209,170 L250,170 C254,170 256,168 257,165 C258,162 256,161 251,161 L190,161 Z" />
        {/* C */}
        <path d="M294,150 L360,150 L356,161 L303,161 C299,161 297,164 296,170 L295,179 C294,185 296,188 301,188 L350,188 L346,199 L290,199 C279,199 275,192 277,180 L279,169 C281,157 286,150 294,150 Z" />
      </g>

      {/* Graduation cap + pencil + tassel */}
      <g stroke={BLUE} strokeWidth={1.2} strokeLinejoin="round">
        <path d="M224,291 L249,299 L224,307 L199,299 Z" fill={WHITE} />
        <path
          d="M210,303 L210,310 C216,313 232,313 238,310 L238,303 L224,308 Z"
          fill={WHITE}
        />
        <path d="M217,312 L231,312 L231,326 L224,337 L217,326 Z" fill={WHITE} />
      </g>
      <line x1="221.5" y1="313" x2="221.5" y2="325" stroke={BLUE} strokeWidth={1.1} />
      <line x1="226.5" y1="313" x2="226.5" y2="325" stroke={BLUE} strokeWidth={1.1} />
      <line x1="217.5" y1="325.5" x2="230.5" y2="325.5" stroke={BLUE} strokeWidth={1.1} />
      <path d="M246,300 L246,312" stroke={WHITE} strokeWidth={1.6} strokeLinecap="round" />
      <circle cx="246" cy="313" r="2" fill={WHITE} />

      {/* Motto centered inside lower shield */}
      <g
        fontFamily="'Segoe UI', system-ui, -apple-system, Arial, sans-serif"
        fontSize={16.5}
        fontWeight={600}
        fill={WHITE}
        textAnchor="middle"
      >
        <text x="224" y="362">Your future is our</text>
        <text x="224" y="384">Mission</text>
      </g>
    </svg>
  );
}
