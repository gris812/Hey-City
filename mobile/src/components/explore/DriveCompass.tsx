import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';

export function DriveCompass({ heading, waiting }: { heading: number; waiting: boolean }) {
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.face, { transform: [{ rotate: `${-heading}deg` }] }]}>
      <Text allowFontScaling={false} style={[styles.north, waiting && styles.waitingNorth]}>N</Text>
      <View style={[styles.needleNorth, waiting && styles.waitingNeedle]} />
      <View style={styles.needleSouth} />
    </View>
  );
}

const styles = StyleSheet.create({
  face: { width: 35, height: 35, borderRadius: 18, borderWidth: 1, borderColor: '#D9E7DF', alignItems: 'center', justifyContent: 'center' },
  north: { fontSize: 12, lineHeight: 13, color: colors.primary, fontWeight: '900' },
  waitingNorth: { color: '#52675B' },
  needleNorth: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 9,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: colors.primary },
  waitingNeedle: { borderBottomColor: '#627A6B' },
  needleSouth: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#B6CBBE' },
});
