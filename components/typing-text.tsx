import { useEffect, useRef, useState } from "react";
import { Animated, type TextStyle } from "react-native";
import { Text } from "@/components/ui/text";

interface TypingTextProps {
  text: string;
  style: TextStyle;
  onFinish?: () => void;
}

export function TypingText({ text, style, onFinish }: TypingTextProps) {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    setDisplayed("");
    indexRef.current = 0;
    const interval = setInterval(() => {
      indexRef.current++;
      if (indexRef.current > text.length) {
        clearInterval(interval);
        onFinish?.();
        return;
      }
      setDisplayed(text.slice(0, indexRef.current));
    }, 60);
    return () => clearInterval(interval);
  }, [text]);

  return (
    <Animated.Text style={style}>
      {displayed}
      <Text style={{ opacity: 0.3 }}>|</Text>
    </Animated.Text>
  );
}
