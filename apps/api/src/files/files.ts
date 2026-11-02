// Uploaded files (homework attachments, materials, circulars) and signed download links
// (BRD §16: links are signed and expire).
import { type Db, eq, files, type Tx } from '@erp/db';
import { AppError } from '@erp/shared';
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Global,
  Inject,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { Public, RequireInstitute } from '../common/decorators.js';
import { currentContext, currentTenant } from '../common/request-context.js';
import { CONFIG, type Config } from '../config.js';
import { SYSTEM_DB, TenantDb } from '../core/core.module.js';

const MAX_BYTES = 20 * 1024 * 1024;

/** Photos, PDFs, office documents, voice notes (HW-02) and short videos. */
const ALLOWED: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
  'audio/mpeg': ['mp3'],
  'audio/mp4': ['m4a'],
  'audio/ogg': ['ogg', 'opus'],
  'audio/webm': ['weba', 'webm'],
  'video/mp4': ['mp4'],
};

const UPLOAD_PERMISSIONS = ['homework.manage', 'materials.manage', 'comms.send'];

const ZIP = (b: Buffer) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
const ISO_MEDIA = (b: Buffer) => b.subarray(4, 8).toString('latin1') === 'ftyp';

/** Leading bytes each type must start with, so a renamed file cannot pass as another type. */
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ZIP,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ZIP,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ZIP,
  'audio/mpeg': (b) => b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0),
  'audio/mp4': ISO_MEDIA,
  'audio/ogg': (b) => b.subarray(0, 4).toString('latin1') === 'OggS',
  'audio/webm': (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
  'video/mp4': ISO_MEDIA,
};

export type UploadedFileData = { buffer: Buffer; originalname: string; mimetype: string; size: number };

export abstract class FileStorage {
  abstract put(key: string, data: Buffer): Promise<void>;
  abstract get(key: string): Promise<Buffer>;
}

/** Development storage on local disk. Production uses object storage (S3) behind the same interface. */
export class LocalFileStorage extends FileStorage {
  constructor(private readonly root: string) {
    super();
  }

  async put(key: string, data: Buffer) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  get(key: string) {
    return readFile(this.path(key));
  }

  private path(key: string) {
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(key)) throw new Error('bad storage key');
    return join(this.root, key);
  }
}

export interface FileLink {
  id: string;
  name: string;
  mime: string;
  sizeBytes: number;
  url: string;
}

@Injectable()
export class FilesService {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    private readonly storage: FileStorage,
    private readonly tenantDb: TenantDb,
    @Inject(SYSTEM_DB) private readonly systemDb: Db,
  ) {}

  async upload(file: UploadedFileData) {
    const extensions = ALLOWED[file.mimetype];
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (!extensions || !extensions.includes(ext)) throw new AppError('invalid', 'File type not allowed');
    if (!SIGNATURES[file.mimetype]?.(file.buffer)) throw new AppError('invalid', 'File contents do not match its type');
    const { instituteId, userId } = currentTenant();
    const storageKey = `${instituteId}/${randomUUID()}`;
    await this.storage.put(storageKey, file.buffer);
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .insert(files)
        .values({ instituteId, storageKey, originalName: file.originalname.slice(0, 200), mime: file.mimetype, sizeBytes: file.size, uploadedBy: userId })
        .returning({ id: files.id, name: files.originalName, mime: files.mime, sizeBytes: files.sizeBytes });
      return { ...row!, url: this.signedUrl(row!.id) };
    });
  }

  /** Signed, expiring link usable without a login (e.g. opened from WhatsApp). */
  signedUrl(fileId: string, ttlSeconds = 24 * 60 * 60) {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    return `${this.config.PUBLIC_APP_URL}/files/${fileId}/content?exp=${exp}&sig=${this.sign(fileId, exp)}`;
  }

  /** Metadata and signed links, for files visible in the transaction's institute. */
  async links(tx: Tx, fileIds: string[]): Promise<FileLink[]> {
    const out: FileLink[] = [];
    for (const id of fileIds) {
      const [row] = await tx.select({ id: files.id, name: files.originalName, mime: files.mime, sizeBytes: files.sizeBytes }).from(files).where(eq(files.id, id));
      if (row) out.push({ ...row, url: this.signedUrl(row.id) });
    }
    return out;
  }

  /** Fails unless every id is a file of the current institute. */
  async assertExist(tx: Tx, fileIds: string[]) {
    const found = await this.links(tx, [...new Set(fileIds)]);
    if (found.length !== new Set(fileIds).size) throw new AppError('invalid', 'Unknown file');
  }

  async read(fileId: string, exp: number, sig: string) {
    if (!Number.isInteger(exp) || exp < Date.now() / 1000) throw new ForbiddenException('Link expired');
    const expected = this.sign(fileId, exp);
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new ForbiddenException('Bad link');
    const [row] = await this.systemDb.select().from(files).where(eq(files.id, fileId));
    if (!row) throw new AppError('not_found', 'File not found');
    return { meta: row, data: await this.storage.get(row.storageKey) };
  }

  private sign(fileId: string, exp: number) {
    return createHmac('sha256', this.config.JWT_SECRET).update(`file:${fileId}:${exp}`).digest('base64url');
  }
}

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @RequireInstitute()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES, files: 1 } }))
  upload(@UploadedFile() file: UploadedFileData | undefined) {
    const held = currentContext().permissions;
    if (!UPLOAD_PERMISSIONS.some((p) => held.has(p))) throw new ForbiddenException('Missing permission');
    if (!file) throw new BadRequestException('Attach the file as multipart field "file"');
    return this.files.upload(file);
  }

  @Public()
  @Get(':id/content')
  async content(@Param('id', ParseUUIDPipe) id: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response) {
    const { meta, data } = await this.files.read(id, Number(exp), sig ?? '');
    res.setHeader('content-type', meta.mime);
    res.setHeader('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(meta.originalName)}`);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('cache-control', 'private, max-age=3600');
    res.send(data);
  }
}

@Global()
@Module({
  controllers: [FilesController],
  providers: [
    FilesService,
    {
      provide: FileStorage,
      inject: [CONFIG],
      useFactory: (config: Config) =>
        new LocalFileStorage(config.FILE_STORAGE_DIR ?? join(process.env.LOCALAPPDATA ?? join(homedir(), '.local', 'share'), 'erp-dev', 'files')),
    },
  ],
  exports: [FilesService],
})
export class FilesModule {}
