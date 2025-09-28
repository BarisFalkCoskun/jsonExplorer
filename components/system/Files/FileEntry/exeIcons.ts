type IconGroupItem = {
  bitCount: number;
  colors: number;
  dataSize: number;
  height: number;
  iconID: number;
  planes: number;
  width: number;
};

type IconGroupEntry = {
  icons: IconGroupItem[];
};

type ResourceEntry = {
  bin: ArrayBuffer | Uint8Array | Buffer;
  id: number;
  type: number;
};

const RESERVED = 0;
const ICON_TYPE = {
  ICO: 1,
};

const createIconHeader = (iconCount: number): Uint8Array =>
  Uint8Array.from([
    RESERVED,
    RESERVED,
    ...new Uint8Array(Uint16Array.from([ICON_TYPE.ICO]).buffer),
    ...new Uint8Array(Uint16Array.from([iconCount]).buffer),
  ]);

const createIconDirEntry = (
  { bitCount, colors, dataSize, height, planes, width }: IconGroupItem,
  offset: number
): Uint8Array =>
  Uint8Array.from([
    width,
    height === width * 2 ? width : height,
    colors,
    RESERVED,
    ...new Uint8Array(Uint16Array.from([planes]).buffer),
    ...new Uint8Array(Uint16Array.from([bitCount]).buffer),
    ...new Uint8Array(Uint32Array.from([dataSize]).buffer),
    ...new Uint8Array(Uint32Array.from([offset]).buffer),
  ]);

const ICONDIR_LENGTH = 6;
const ICONDIRENTRY_LENGTH = 16;
const RC_ICON = 3;

let lockIconExtraction = false;

export const extractExeIcon = async (
  exeData: Buffer
): Promise<Buffer | undefined> => {
  if (lockIconExtraction) {
    return new Promise((resolve) => {
      requestAnimationFrame(() => extractExeIcon(exeData).then(resolve));
    });
  }

  lockIconExtraction = true;

  const ResEdit = await import("resedit");
  let iconGroupEntry: IconGroupEntry;
  let entries: ResourceEntry[];

  try {
    const executable = ResEdit.NtExecutable.from(exeData, {
      ignoreCert: true,
    });
    const resource = ResEdit.NtExecutableResource.from(executable, true);

    entries = resource.entries as ResourceEntry[];

    const [rawIconGroupEntry] = ResEdit.Resource.IconGroupEntry.fromEntries(
      entries as unknown as Parameters<
        typeof ResEdit.Resource.IconGroupEntry.fromEntries
      >[0]
    );

    iconGroupEntry = {
      icons:
        rawIconGroupEntry?.icons.map(
          ({ bitCount, colors, dataSize, height, iconID, planes, width }) => ({
            bitCount,
            colors,
            dataSize,
            height,
            iconID,
            planes,
            width,
          })
        ) ?? [],
    };
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message.includes("Binary with symbols is not supported now")
    ) {
      const { unarchive } = await import("utils/zipFunctions");

      try {
        const { "/.rsrc/ICON/1.ico": icon } =
          (await unarchive("data.exe", exeData)) || {};
        const iconBuffer = Buffer.from(icon);

        lockIconExtraction = false;

        return iconBuffer;
      } catch {
        // Ignore error extracting EXE
      }
    }

    lockIconExtraction = false;

    return undefined;
  }

  if (!iconGroupEntry?.icons) {
    lockIconExtraction = false;

    return undefined;
  }

  const toBuffer = (data: ResourceEntry["bin"]): Buffer => {
    if (Buffer.isBuffer(data)) return data;
    if (data instanceof Uint8Array) return Buffer.from(data);

    return Buffer.from(new Uint8Array(data));
  };

  const getByteLength = (data: ResourceEntry["bin"]): number => {
    if (Buffer.isBuffer(data)) return data.length;
    if (data instanceof Uint8Array) return data.byteLength;

    return data.byteLength;
  };

  const iconDataOffset =
    ICONDIR_LENGTH + ICONDIRENTRY_LENGTH * iconGroupEntry.icons.length;
  let currentIconOffset = iconDataOffset;
  const iconData = iconGroupEntry.icons.map(({ iconID }) =>
    entries.find(({ id, type }) => type === RC_ICON && id === iconID)
  );
  const iconHeader = iconGroupEntry.icons.reduce(
    (accHeader, iconBitmapInfo, index) => {
      const previousEntry = iconData[index - 1];

      currentIconOffset +=
        index && previousEntry ? getByteLength(previousEntry.bin) : 0;

      return Buffer.concat([
        accHeader,
        createIconDirEntry(iconBitmapInfo, currentIconOffset),
      ]);
    },
    createIconHeader(iconGroupEntry.icons.length)
  );

  const combinedIconBuffer = Buffer.from(
    iconData.reduce(
      (accIcon, iconItem) =>
        iconItem ? Buffer.concat([accIcon, toBuffer(iconItem.bin)]) : accIcon,
      iconHeader
    )
  );

  lockIconExtraction = false;

  return combinedIconBuffer;
};
