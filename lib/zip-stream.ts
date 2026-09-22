// ---------------------------------------------------------------
// Minimal streaming ZIP builder.
//
// Unlike JSZip (which assembles the whole archive in memory), this
// emits ZIP bytes chunk-by-chunk via onData as each file is added,
// so memory stays flat no matter how many files go in.
//
// Uses STORE (no compression) — jewelry videos/photos are already
// compressed, so deflating them wastes CPU for almost no size gain.
// This keeps it fast and simple.
// ---------------------------------------------------------------

type ZipStreamOptions = {
  onData: (chunk: Uint8Array) => void;
};

type CentralEntry = {
  nameBytes: Uint8Array;
  crc: number;
  size: number;
  offset: number;
};

// CRC32 table (computed once).
const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// Little-endian writers.
function u16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff];
}
function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

export default class ZipStream {
  private onData: (chunk: Uint8Array) => void;
  private entries: CentralEntry[] = [];
  private offset = 0;

  constructor(options: ZipStreamOptions) {
    this.onData = options.onData;
  }

  private emit(bytes: number[] | Uint8Array) {
    const chunk = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.onData(chunk);
    this.offset += chunk.length;
  }

  addFile(name: string, data: Uint8Array) {
    const nameBytes = toBytes(name);
    const crc = crc32(data);
    const size = data.length;
    const entryOffset = this.offset;

    // Local file header
    const header: number[] = [
      ...u32(0x04034b50), // signature
      ...u16(20), // version needed
      ...u16(0), // flags
      ...u16(0), // compression: 0 = STORE
      ...u16(0), // mod time
      ...u16(0), // mod date
      ...u32(crc),
      ...u32(size), // compressed size
      ...u32(size), // uncompressed size
      ...u16(nameBytes.length),
      ...u16(0), // extra length
    ];
    this.emit(header);
    this.emit(nameBytes);
    this.emit(data);

    this.entries.push({ nameBytes, crc, size, offset: entryOffset });
  }

  finish() {
    const centralStart = this.offset;

    for (const e of this.entries) {
      const central: number[] = [
        ...u32(0x02014b50), // central dir signature
        ...u16(20), // version made by
        ...u16(20), // version needed
        ...u16(0), // flags
        ...u16(0), // compression
        ...u16(0), // mod time
        ...u16(0), // mod date
        ...u32(e.crc),
        ...u32(e.size),
        ...u32(e.size),
        ...u16(e.nameBytes.length),
        ...u16(0), // extra length
        ...u16(0), // comment length
        ...u16(0), // disk number
        ...u16(0), // internal attrs
        ...u32(0), // external attrs
        ...u32(e.offset),
      ];
      this.emit(central);
      this.emit(e.nameBytes);
    }

    const centralSize = this.offset - centralStart;

    const end: number[] = [
      ...u32(0x06054b50), // end of central dir signature
      ...u16(0), // disk number
      ...u16(0), // disk with central dir
      ...u16(this.entries.length), // entries on this disk
      ...u16(this.entries.length), // total entries
      ...u32(centralSize),
      ...u32(centralStart),
      ...u16(0), // comment length
    ];
    this.emit(end);
  }
}