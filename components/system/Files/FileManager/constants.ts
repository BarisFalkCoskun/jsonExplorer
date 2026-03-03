export type IconZoomLevel = {
  fontSize: number;
  gridHeight: number;
  gridWidth: number;
  iconSize: number;
  labelWidth: number;
  rowGap: number;
};

export const ICON_ZOOM_LEVELS: IconZoomLevel[] = [
  { fontSize: 11, gridHeight: 40, gridWidth: 56, iconSize: 16, labelWidth: 52, rowGap: 8 },
  { fontSize: 11, gridHeight: 56, gridWidth: 64, iconSize: 32, labelWidth: 60, rowGap: 16 },
  { fontSize: 12, gridHeight: 70, gridWidth: 74, iconSize: 48, labelWidth: 70, rowGap: 28 },
  { fontSize: 12, gridHeight: 88, gridWidth: 88, iconSize: 64, labelWidth: 84, rowGap: 28 },
  { fontSize: 12, gridHeight: 112, gridWidth: 112, iconSize: 96, labelWidth: 108, rowGap: 28 },
  { fontSize: 13, gridHeight: 152, gridWidth: 148, iconSize: 128, labelWidth: 144, rowGap: 28 },
  { fontSize: 13, gridHeight: 280, gridWidth: 272, iconSize: 256, labelWidth: 268, rowGap: 28 },
];

export const DEFAULT_ICON_ZOOM_LEVEL = 2;
