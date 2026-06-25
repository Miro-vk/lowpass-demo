import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

type Props = {
  value: number;
  onChange: (v: number) => void;
  textColor: string;
  bgColor: string;
};

const OPTIONS = [
  { value: 1,  label: "1 DAY" },
  { value: 7,  label: "7 DAYS" },
  { value: 30, label: "30 DAYS" },
];

export default function TimeframePicker({ value, onChange, textColor, bgColor }: Props) {
  const [open, setOpen] = useState(false);
  const [triggerH, setTriggerH] = useState(0);
  const label = OPTIONS.find((o) => o.value === value)?.label ?? "30 DAYS";

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.trigger, { borderColor: textColor }]}
        onLayout={(e) => setTriggerH(e.nativeEvent.layout.height)}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.8}
      >
        <View>
          <Text style={[styles.triggerText, { color: "transparent" }]} numberOfLines={1}>
            30 DAYS  ▾
          </Text>
          <Text style={[styles.triggerText, { color: textColor, position: "absolute", top: 0, left: 0, right: 0 }]} numberOfLines={1}>
            {label}  {open ? "▴" : "▾"}
          </Text>
        </View>
      </TouchableOpacity>

      {open && (
        <View style={[styles.menu, { top: triggerH, borderColor: textColor, backgroundColor: bgColor }]}>
          {OPTIONS.map((opt) => {
            const active = opt.value === value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.option, active && { backgroundColor: textColor }]}
                onPress={() => { onChange(opt.value); setOpen(false); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.optionText, { color: active ? bgColor : textColor }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { zIndex: 99, elevation: 99 },
  trigger: { borderWidth: 2, paddingHorizontal: 10, paddingVertical: 5 },
  triggerText: { fontSize: 11, fontWeight: "900", letterSpacing: 2 },
  menu: {
    position: "absolute",
    right: 0,
    borderWidth: 2,
    zIndex: 99,
    elevation: 99,
    minWidth: 90,
  },
  option: { paddingHorizontal: 10, paddingVertical: 9 },
  optionText: { fontSize: 11, fontWeight: "900", letterSpacing: 2 },
});
