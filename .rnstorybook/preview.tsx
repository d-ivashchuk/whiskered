import type { Preview } from "@storybook/react";
import { View } from "react-native";

const preview: Preview = {
  decorators: [
    (Story) => (
      <View style={{ flex: 1, backgroundColor: "#F5F0E8" }}>
        <Story />
      </View>
    ),
  ],
};

export default preview;
