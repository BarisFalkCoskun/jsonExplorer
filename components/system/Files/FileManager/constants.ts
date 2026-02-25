export type IconZoomLevel = {
  iconSize: number;
  gridWidth: number;
  gridHeight: number;
  rowGap: number;
  labelWidth: number;
  fontSize: number;
};

export const ICON_ZOOM_LEVELS: IconZoomLevel[] = [
  { iconSize: 16, gridWidth: 56, gridHeight: 40, rowGap: 8, labelWidth: 52, fontSize: 11 },
  { iconSize: 32, gridWidth: 64, gridHeight: 56, rowGap: 16, labelWidth: 60, fontSize: 11 },
  { iconSize: 48, gridWidth: 74, gridHeight: 70, rowGap: 28, labelWidth: 70, fontSize: 12 },
  { iconSize: 64, gridWidth: 88, gridHeight: 88, rowGap: 28, labelWidth: 84, fontSize: 12 },
  { iconSize: 96, gridWidth: 112, gridHeight: 112, rowGap: 28, labelWidth: 108, fontSize: 12 },
  { iconSize: 128, gridWidth: 148, gridHeight: 152, rowGap: 28, labelWidth: 144, fontSize: 13 },
  { iconSize: 256, gridWidth: 272, gridHeight: 280, rowGap: 28, labelWidth: 268, fontSize: 13 },
];

export const DEFAULT_ICON_ZOOM_LEVEL = 2;
