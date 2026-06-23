import Svg, { Circle, Path, G, Rect } from "react-native-svg";

export default function LowpassIcon({ size = 52, isDark = false }: { size?: number; isDark?: boolean }) {
  const bg = isDark ? "#1A1A1A" : "#F5F4EF";
  const ink = isDark ? "#FFFFFF" : "#1A1A1A";
  const opacity = isDark ? 0.55 : 0.35;

  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Rect width="1024" height="1024" rx="220" fill={bg} />
      <G fill={ink} opacity={opacity}>
        <Circle cx={246} cy={318} r={24} />
        <Circle cx={386} cy={252} r={29} />
        <Circle cx={544} cy={299} r={24} />
        <Circle cx={702} cy={246} r={29} />
        <Circle cx={842} cy={308} r={24} />
        <Circle cx={322} cy={440} r={24} />
        <Circle cx={480} cy={412} r={24} />
        <Circle cx={640} cy={440} r={24} />
        <Circle cx={780} cy={412} r={24} />
      </G>
      <Path
        d="M 196 516 L 504 824 L 504 910 L 580 910 L 580 824 L 888 516"
        fill="none" stroke={ink} strokeWidth={44}
        strokeLinejoin="round" strokeLinecap="round"
      />
      <Circle cx={540} cy={970} r={38} fill="#F5B82E" />
    </Svg>
  );
}
