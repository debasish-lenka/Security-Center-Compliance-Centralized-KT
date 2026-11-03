import PDFDocument from 'pdfkit';
import { extname } from 'path';
import { PDFDocument as PdfLib, StandardFonts, rgb } from 'pdf-lib';
import { formatWhen, latin } from '../services/watermark.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLogger } from '../services/audit-logger.js';
import { getStorageService } from '../services/storage.js';

const GenerateKnowledgeBookSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  includeDocumentIds: z.array(z.string().uuid()).optional().default([]),
  coverConfig: z.object({
    projectName: z.boolean().default(true),
    projectDescription: z.boolean().default(true),
    generatedBy: z.boolean().default(true),
    generatedDate: z.boolean().default(true),
    version: z.boolean().default(true),
    logo: z.boolean().default(false),
  }).optional(),
  tocConfig: z.object({
    includePageNumbers: z.boolean().default(true),
    groupByCategory: z.boolean().default(true),
    showVersions: z.boolean().default(true),
    showAuthors: z.boolean().default(true),
    showDates: z.boolean().default(true),
  }).optional(),
  pageNumbering: z.enum(['continuous', 'per_section']).default('continuous'),
});

const UpdateKnowledgeBookSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(['GENERATING', 'COMPLETED', 'FAILED', 'ARCHIVED']).optional(),
});

async function checkProjectAccess(app: FastifyInstance, userId: string, userRole: string, projectId: string) {
  if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') return true;
  const membership = await app.prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  return !!membership;
}

export async function knowledgeBookRoutes(app: FastifyInstance) {
  const auditLogger = createAuditLogger(app);
  const storage = getStorageService();

  // List knowledge books for a project
  app.get('/:projectId/knowledge-books', {
    schema: {
      querystring: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
        status: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };
    const { page, limit, status } = request.query as any;

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this project' } });
    }

    const where: any = { projectId };
    if (status) where.status = status;

    const [books, total] = await Promise.all([
      app.prisma.knowledgeBook.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          generator: { select: { id: true, fullName: true, email: true } },
          project: { select: { id: true, name: true } },
        },
      }),
      app.prisma.knowledgeBook.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: { items: books, total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  });

  // Get single knowledge book
  app.get('/:projectId/knowledge-books/:bookId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, bookId } = request.params as { projectId: string; bookId: string };

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const book = await app.prisma.knowledgeBook.findFirst({
      where: { id: bookId, projectId },
      include: {
        generator: { select: { id: true, fullName: true, email: true } },
        project: { select: { id: true, name: true, description: true, category: true } },
      },
    });

    if (!book) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Knowledge book not found' } });
    }

    return reply.send({ success: true, data: book });
  });

  // Generate knowledge book
  app.post('/:projectId/knowledge-books', {
    schema: { body: GenerateKnowledgeBookSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId } = request.params as { projectId: string };
    const data = request.body as z.infer<typeof GenerateKnowledgeBookSchema>;

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this project' } });
    }

    // Get project details
    const project = await app.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, description: true, category: true, ownerId: true, creator: { select: { fullName: true } } },
    });

    if (!project) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    // Determine which documents to include
    let documentIds = data.includeDocumentIds;
    if (documentIds.length === 0) {
      // Include all approved/published documents by default
      const documents = await app.prisma.projectDocument.findMany({
        where: {
          projectId,
          status: { in: ['APPROVED', 'PUBLISHED'] },
        },
        select: { id: true },
      });
      documentIds = documents.map(d => d.id);
    }

    // Create knowledge book record
    const book = await app.prisma.knowledgeBook.create({
      data: {
        projectId,
        title: data.title,
        description: data.description,
        status: 'GENERATING',
        generatedById: userId,
        includesDocuments: documentIds,
        coverConfig: data.coverConfig as any,
        tocConfig: data.tocConfig as any,
        pageNumbering: data.pageNumbering,
      },
    });

    // Start async generation
    generateKnowledgeBookAsync(app, storage, book.id, project, documentIds, data, userId).catch(err => {
      console.error('Knowledge book generation failed:', err);
    });

    await auditLogger.logResource('CREATE', userId, 'knowledge_book', book.id, {
      title: data.title,
      projectId,
      documentCount: documentIds.length
    }, request.ip, request.headers['user-agent']);

    return reply.code(202).send({ success: true, data: { ...book, status: 'GENERATING' } });
  });

  // Update knowledge book
  app.patch('/:projectId/knowledge-books/:bookId', {
    schema: { body: UpdateKnowledgeBookSchema },
  }, async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, bookId } = request.params as { projectId: string; bookId: string };
    const data = request.body as z.infer<typeof UpdateKnowledgeBookSchema>;

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const book = await app.prisma.knowledgeBook.update({
      where: { id: bookId },
      data,
      include: {
        generator: { select: { id: true, fullName: true, email: true } },
        project: { select: { id: true, name: true } },
      },
    });

    await auditLogger.logResource('UPDATE', userId, 'knowledge_book', bookId, data, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: book });
  });

  // Delete knowledge book
  app.delete('/:projectId/knowledge-books/:bookId', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, bookId } = request.params as { projectId: string; bookId: string };

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const book = await app.prisma.knowledgeBook.findFirst({ where: { id: bookId, projectId } });
    if (!book) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Knowledge book not found' } });
    }

    // Delete PDF from storage if exists
    if (book.pdfStorageKey) {
      await storage.delete(book.pdfStorageKey).catch(() => {});
    }

    await app.prisma.knowledgeBook.delete({ where: { id: bookId } });

    await auditLogger.logResource('DELETE', userId, 'knowledge_book', bookId, { title: book.title }, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: null });
  });

  // Download knowledge book PDF
  app.get('/:projectId/knowledge-books/:bookId/download', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, bookId } = request.params as { projectId: string; bookId: string };

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const book = await app.prisma.knowledgeBook.findFirst({ where: { id: bookId, projectId } });
    if (!book || !book.pdfStorageKey) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'PDF not found' } });
    }

    const downloadUrl = await storage.getDownloadUrl(book.pdfStorageKey, `${book.title}.pdf`, 300);

    // Log access
    await app.prisma.activityFeed.create({
      data: {
        actorId: userId,
        action: 'DOWNLOAD',
        resourceType: 'knowledge_book',
        resourceId: bookId,
        projectId,
        details: { title: book.title },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      },
    });

    await auditLogger.logResource('DOWNLOAD', userId, 'knowledge_book', bookId, { title: book.title }, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: { downloadUrl, expiresIn: 300 } });
  });

  // Regenerate knowledge book
  app.post('/:projectId/knowledge-books/:bookId/regenerate', async (request, reply) => {
    const userId = request.userId!;
    const userRole = request.user!.role;
    const { projectId, bookId } = request.params as { projectId: string; bookId: string };

    const hasAccess = await checkProjectAccess(app, userId, userRole, projectId);
    if (!hasAccess) {
      return reply.code(403).send({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const book = await app.prisma.knowledgeBook.findFirst({ where: { id: bookId, projectId } });
    if (!book) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Knowledge book not found' } });
    }

    const project = await app.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, description: true, category: true },
    });

    if (!project) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    // Update status to GENERATING
    await app.prisma.knowledgeBook.update({
      where: { id: bookId },
      data: { status: 'GENERATING', pdfUrl: null, pdfStorageKey: null, generatedAt: null },
    });

    // Start async generation
    generateKnowledgeBookAsync(app, storage, bookId, project, book.includesDocuments, {
      title: book.title,
      description: book.description,
      coverConfig: book.coverConfig as any,
      tocConfig: book.tocConfig as any,
      pageNumbering: book.pageNumbering,
    }, userId).catch(err => {
      console.error('Knowledge book regeneration failed:', err);
    });

    await auditLogger.logResource('UPDATE', userId, 'knowledge_book', bookId, { action: 'regenerate' }, request.ip, request.headers['user-agent']);

    return reply.send({ success: true, data: { status: 'GENERATING' } });
  });
}

async function generateKnowledgeBookAsync(
  app: FastifyInstance,
  storage: ReturnType<typeof getStorageService>,
  bookId: string,
  project: any,
  documentIds: string[],
  config: any,
  userId: string
) {
  try {
    // Fetch all documents with details
    const documents = await app.prisma.projectDocument.findMany({
      where: { id: { in: documentIds } },
      orderBy: [{ category: 'asc' }, { createdAt: 'asc' }],
      include: {
        uploader: { select: { id: true, fullName: true, email: true } },
        owner: { select: { id: true, fullName: true, email: true } },
        versions: { orderBy: { version: 'desc' }, take: 1 },
        ktReport: { select: { id: true, reportDate: true } },
      },
    });

    // Generate PDF content
    const pdfBuffer = await generatePDF(project, documents, config, storage);

    // Upload to storage
    const storageKey = storage.generateKey(`${project.name}-knowledge-book-${Date.now()}.pdf`, project.id);
    await storage.upload(storageKey, pdfBuffer, 'application/pdf');
    const pdfUrl = await storage.getDownloadUrl(storageKey, `${project.name}-knowledge-book.pdf`, 86400);

    // Update knowledge book
    await app.prisma.knowledgeBook.update({
      where: { id: bookId },
      data: {
        status: 'COMPLETED',
        pdfUrl,
        pdfStorageKey: storageKey,
        generatedAt: new Date(),
        version: { increment: 1 },
      },
    });

    // Log activity
    await app.prisma.activityFeed.create({
      data: {
        actorId: userId,
        action: 'GENERATE_KB',
        resourceType: 'knowledge_book',
        resourceId: bookId,
        projectId: project.id,
        details: { title: config.title, documentCount: documents.length },
        ipAddress: 'system',
        userAgent: 'knowledge-book-generator',
      },
    });

    // Notify generator
    const notificationService = (await import('../services/notifications.js')).createNotificationService(app);
    await notificationService.create({
      userId,
      type: 'NEW_DOCUMENT',
      title: 'Knowledge Book Generated',
      message: `Knowledge book "${config.title}" has been generated successfully`,
      resourceType: 'knowledge_book',
      resourceId: bookId,
    });

    // Notify project members
    const members = await app.prisma.projectMember.findMany({
      where: { projectId: project.id, userId: { not: userId } },
      select: { userId: true },
    });
    for (const member of members) {
      await notificationService.create({
        userId: member.userId,
        type: 'NEW_DOCUMENT',
        title: 'New Knowledge Book Available',
        message: `Knowledge book "${config.title}" for project "${project.name}" is now available`,
        resourceType: 'knowledge_book',
        resourceId: bookId,
      });
    }

  } catch (error) {
    console.error('Knowledge book generation error:', error);

    await app.prisma.knowledgeBook.update({
      where: { id: bookId },
      data: { status: 'FAILED' },
    });

    const notificationService = (await import('../services/notifications.js')).createNotificationService(app);
    await notificationService.create({
      userId,
      type: 'NEW_DOCUMENT',
      title: 'Knowledge Book Generation Failed',
      message: `Knowledge book "${config.title}" generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      resourceType: 'knowledge_book',
      resourceId: bookId,
    });
  }
}

// Builds the knowledge book as a real PDF: cover page, table of contents, one section per document,
// followed by the real pages of every PDF document. Each page carries the name, date and time of the
// person who made it at the bottom.
async function generatePDF(project: any, documents: any[], config: any, storage: ReturnType<typeof getStorageService>): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 56, bufferPages: true, info: { Title: config.title, Author: 'DBI Security Center' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const cyan = '#0e7490';
  const grey = '#475569';
  const date = (d: Date) => new Date(d).toLocaleDateString('en-GB');

  // Cover
  doc.rect(0, 0, doc.page.width, 12).fill(cyan);
  doc.fillColor('#0f172a').fontSize(30).font('Helvetica-Bold').text(config.title, 56, 220, { width: doc.page.width - 112 });
  doc.moveDown(0.6).fontSize(16).font('Helvetica').fillColor(cyan).text(project.name);
  if (project.description) doc.moveDown(0.8).fontSize(11).fillColor(grey).text(project.description, { width: doc.page.width - 112 });
  doc.moveDown(2).fontSize(10).fillColor(grey)
    .text(`Generated ${date(new Date())}`)
    .text(`${documents.length} document${documents.length === 1 ? '' : 's'} included`);

  // Table of contents
  doc.addPage();
  doc.fillColor('#0f172a').fontSize(20).font('Helvetica-Bold').text('Contents');
  doc.moveDown(0.8).fontSize(11).font('Helvetica').fillColor('#0f172a');
  if (documents.length === 0) {
    doc.fillColor(grey).text('No approved or published documents were available when this book was generated.');
  }
  documents.forEach((d, i) => {
    doc.text(`${i + 1}.  ${d.name}`, { continued: true }).fillColor(grey).text(`   ${d.category.replace(/_/g, ' ')}  ·  v${d.version}`).fillColor('#0f172a');
  });

  // One section per document (metadata; the files themselves stay in the Document Vault)
  const sectionPage: number[] = [];
  documents.forEach((d, i) => {
    doc.addPage();
    sectionPage.push(doc.bufferedPageRange().count - 1);
    doc.fillColor(cyan).fontSize(10).font('Helvetica-Bold').text(`SECTION ${i + 1}`);
    doc.moveDown(0.3).fillColor('#0f172a').fontSize(18).text(d.name);
    doc.moveDown(0.8).fontSize(11).font('Helvetica');
    const rows: [string, string][] = [
      ['Category', d.category.replace(/_/g, ' ')],
      ['Version', `v${d.version}`],
      ['Author', d.uploader?.fullName ?? 'Unknown'],
      ['Owner', d.owner?.fullName ?? 'Unknown'],
      ['Created', date(d.createdAt)],
      ['Last modified', date(d.updatedAt)],
      ['Tags', d.tags?.length ? d.tags.join(', ') : 'None'],
    ];
    for (const [k, v] of rows) {
      doc.fillColor(grey).text(`${k}: `, { continued: true }).fillColor('#0f172a').text(v);
    }
    const description = d.metadata?.description;
    if (description) doc.moveDown(0.8).fillColor('#0f172a').text(String(description), { width: doc.page.width - 112 });
  });

  doc.end();
  const front = await done;

  // Join the real pages of the PDF documents after the front matter
  const out = await PdfLib.load(front);
  const font = await out.embedFont(StandardFonts.Helvetica);
  const credit = (d: any) => `Prepared by ${d.uploader?.fullName ?? 'Unknown'} - ${formatWhen(new Date(d.createdAt))}`;
  const marks: (string | null)[] = new Array(out.getPageCount()).fill(null);
  documents.forEach((d, i) => { marks[sectionPage[i]] = credit(d); });

  for (const d of documents) {
    if (extname(d.storageKey ?? '').toLowerCase() !== '.pdf' || !(await storage.exists(d.storageKey))) continue;
    try {
      const chunks: Buffer[] = [];
      for await (const c of storage.openRead(d.storageKey)) chunks.push(c as Buffer);
      const src = await PdfLib.load(Buffer.concat(chunks));
      for (const page of await out.copyPages(src, src.getPageIndices())) {
        out.addPage(page);
        marks.push(credit(d));
      }
    } catch {
      // a damaged PDF cannot be merged; its section page still lists it
    }
  }

  const total = out.getPageCount();
  out.getPages().forEach((page, i) => {
    const { width } = page.getSize();
    const mark = marks[i];
    if (mark) {
      const t = latin(mark);
      page.drawText(t, { x: Math.max(8, (width - font.widthOfTextAtSize(t, 8)) / 2), y: 24, size: 8, font, color: rgb(0.2, 0.2, 0.2) });
    }
    const n = `${i + 1} / ${total}`;
    page.drawText(n, { x: Math.max(8, (width - font.widthOfTextAtSize(n, 8)) / 2), y: 12, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
  });
  return Buffer.from(await out.save());
}
