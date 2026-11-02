import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Font,
  pdf,
} from '@react-pdf/renderer';

// Register fonts (using built-in fonts for now)
Font.register({
  family: 'Helvetica',
  fonts: [
    { src: 'https://cdn.jsdelivr.net/npm/@react-pdf/renderer@3.1.14/fonts/Helvetica.afm', fontWeight: 'normal' },
    { src: 'https://cdn.jsdelivr.net/npm/@react-pdf/renderer@3.1.14/fonts/Helvetica-Bold.afm', fontWeight: 'bold' },
    { src: 'https://cdn.jsdelivr.net/npm/@react-pdf/renderer@3.1.14/fonts/Helvetica-Oblique.afm', fontStyle: 'italic' },
    { src: 'https://cdn.jsdelivr.net/npm/@react-pdf/renderer@3.1.14/fonts/Helvetica-BoldOblique.afm', fontWeight: 'bold', fontStyle: 'italic' },
  ],
});

export interface KnowledgeBookConfig {
  title: string;
  subtitle?: string;
  description?: string;
  author?: string;
  contributors?: string[];
  projectName?: string;
  projectId?: string;
  coverImage?: string;
  includeWatermark?: boolean;
  watermarkText?: string;
  includeToc?: boolean;
  includePageNumbers?: boolean;
  footerText?: string;
  metadata?: Record<string, string>;
}

export interface DocumentContent {
  id: string;
  title: string;
  content: string;
  type: string;
  author?: string;
  createdAt: string;
  updatedAt?: string;
  tags?: string[];
  order: number;
  pageCount?: number;
}

export interface KnowledgeBookDocument {
  config: KnowledgeBookConfig;
  documents: DocumentContent[];
  coverPage?: CoverPageConfig;
  toc?: TableOfContentsConfig;
}

export interface CoverPageConfig {
  title: string;
  subtitle?: string;
  author?: string;
  date?: string;
  projectName?: string;
  logo?: string;
  backgroundColor?: string;
  textColor?: string;
}

export interface TableOfContentsConfig {
  title: string;
  includePageNumbers: boolean;
  maxDepth: number;
  style?: 'dots' | 'lines' | 'none';
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    paddingTop: 60,
    paddingBottom: 80,
    fontSize: 11,
    lineHeight: 1.6,
    fontFamily: 'Helvetica',
    color: '#1a1a1a',
  },
  coverPage: {
    padding: 0,
    margin: 0,
  },
  coverContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 60,
    backgroundColor: '#080D18',
  },
  coverTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#53D8FB',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 1.2,
  },
  coverSubtitle: {
    fontSize: 18,
    color: '#88929E',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 1.4,
  },
  coverMeta: {
    fontSize: 12,
    color: '#53D8FB',
    textAlign: 'center',
    marginTop: 8,
  },
  coverDivider: {
    width: '40%',
    height: 2,
    backgroundColor: '#53D8FB',
    marginVertical: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#080D18',
    marginTop: 24,
    marginBottom: 12,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#53D8FB',
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginTop: 16,
    marginBottom: 8,
  },
  bodyText: {
    fontSize: 11,
    lineHeight: 1.7,
    color: '#333',
    marginBottom: 8,
    textAlign: 'justify',
  },
  metaText: {
    fontSize: 9,
    color: '#88929E',
    marginBottom: 4,
  },
  tag: {
    fontSize: 8,
    color: '#53D8FB',
    backgroundColor: '#E8F8FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    marginRight: 4,
    marginBottom: 4,
  },
  tocContainer: {
    padding: 40,
    paddingTop: 60,
  },
  tocTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#080D18',
    marginBottom: 24,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E1E4E8',
  },
  tocEntry: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 8,
    paddingLeft: 16,
  },
  tocEntryLevel1: {
    paddingLeft: 0,
    fontWeight: 'bold',
    fontSize: 12,
  },
  tocEntryLevel2: {
    paddingLeft: 20,
    fontSize: 11,
  },
  tocEntryLevel3: {
    paddingLeft: 40,
    fontSize: 10,
    color: '#666',
  },
  tocDots: {
    flex: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E1E4E8',
    borderBottomStyle: 'dotted',
    marginHorizontal: 8,
    marginBottom: 2,
  },
  tocPageNumber: {
    fontSize: 11,
    color: '#666',
    minWidth: 30,
    textAlign: 'right',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 9,
    color: '#88929E',
    borderTopWidth: 0.5,
    borderTopColor: '#E1E4E8',
    paddingTop: 8,
  },
  pageNumber: {
    fontSize: 9,
    color: '#88929E',
  },
  watermark: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.05,
  },
  watermarkText: {
    fontSize: 60,
    fontWeight: 'bold',
    color: '#666',
    // Note: transform rotate not fully supported in react-pdf, using text orientation instead
  },
  documentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E1E4E8',
  },
  documentTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#080D18',
  },
  documentMeta: {
    fontSize: 9,
    color: '#88929E',
  },
});

// Cover Page Component
export function CoverPage({ config }: { config: CoverPageConfig }) {
  return (
    <Page size="A4" style={styles.coverPage}>
      <View style={styles.coverContainer}>
        <Text style={styles.coverTitle}>{config.title}</Text>
        {config.subtitle && <Text style={styles.coverSubtitle}>{config.subtitle}</Text>}
        <View style={styles.coverDivider} />
        {config.author && <Text style={styles.coverMeta}>Author: {config.author}</Text>}
        {config.projectName && <Text style={styles.coverMeta}>Project: {config.projectName}</Text>}
        {config.date && <Text style={styles.coverMeta}>Date: {config.date}</Text>}
        <Text style={styles.coverMeta}>Generated on {new Date().toLocaleDateString()}</Text>
      </View>
    </Page>
  );
}

// Table of Contents Component
export function TableOfContents({ entries, config }: { entries: TocEntry[]; config: TableOfContentsConfig }) {
  return (
    <Page size="A4" style={styles.tocContainer}>
      <Text style={styles.tocTitle}>{config.title}</Text>
      {entries.map((entry, index) => (
        <View key={index} style={[
          styles.tocEntry,
          entry.level === 1 ? styles.tocEntryLevel1 : entry.level === 2 ? styles.tocEntryLevel2 : styles.tocEntryLevel3,
        ]}>
          <Text style={{ flex: 1 }}>{entry.title}</Text>
          {config.includePageNumbers && (
            <>
              <View style={styles.tocDots} />
              <Text style={styles.tocPageNumber}>{entry.pageNumber}</Text>
            </>
          )}
        </View>
      ))}
    </Page>
  );
}

export interface TocEntry {
  title: string;
  pageNumber: number;
  level: 1 | 2 | 3;
  documentId?: string;
}

// Main Document Page with content
export function DocumentPage({
  document,
  config,
  pageNumber,
  totalPages,
}: {
  document: DocumentContent;
  config: KnowledgeBookConfig;
  pageNumber: number;
  totalPages: number;
}) {
  return (
    <Page size="A4" style={styles.page}>
      {config.includeWatermark && (
        <View style={styles.watermark}>
          <Text style={styles.watermarkText}>{config.watermarkText || 'CONFIDENTIAL'}</Text>
        </View>
      )}

      <View style={styles.documentHeader}>
        <Text style={styles.documentTitle}>{document.title}</Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {document.author && <Text style={styles.documentMeta}>Author: {document.author}</Text>}
          <Text style={styles.documentMeta}>Created: {new Date(document.createdAt).toLocaleDateString()}</Text>
        </View>
      </View>

      {document.tags && document.tags.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 }}>
          {document.tags.map((tag) => (
            <Text key={tag} style={styles.tag}>{tag}</Text>
          ))}
        </View>
      )}

      <Text style={styles.bodyText}>{document.content}</Text>

      {(config.includePageNumbers || config.footerText) && (
        <View style={styles.footer}>
          <Text style={styles.pageNumber}>{config.footerText || ''}</Text>
          {config.includePageNumbers && (
            <Text style={styles.pageNumber}>
              Page {pageNumber} of {totalPages}
            </Text>
          )}
        </View>
      )}
    </Page>
  );
}

// Generate the complete knowledge book document
export function generateKnowledgeBookDocument(bookData: KnowledgeBookDocument) {
  const { config, documents, coverPage, toc } = bookData;

  // Sort documents by order
  const sortedDocs = [...documents].sort((a, b) => a.order - b.order);

  // Calculate page numbers for TOC
  // Each document gets at least 1 page, cover = 1, TOC = 1
  let currentPage = 1;
  if (coverPage) currentPage++;
  if (toc) currentPage++;

  const tocEntries: TocEntry[] = sortedDocs.map((doc) => {
    const entry: TocEntry = {
      title: doc.title,
      pageNumber: currentPage,
      level: 1,
      documentId: doc.id,
    };
    // Estimate page count (roughly 1 page per 3000 chars)
    currentPage += Math.max(1, Math.ceil(doc.content.length / 3000));
    return entry;
  });

  const totalPages = currentPage - 1;

  // Build the document
  const children = [
    coverPage && <CoverPage key="cover" config={coverPage} />,
    toc && <TableOfContents key="toc" entries={tocEntries} config={toc} />,
    ...sortedDocs.map((doc, index) => {
      const entry = tocEntries[index];
      return (
        <DocumentPage
          key={doc.id}
          document={doc}
          config={config}
          pageNumber={entry.pageNumber}
          totalPages={totalPages}
        />
      );
    }),
  ];

  return (
    <Document>
      {children}
    </Document>
  );
}

// Blob generation utility
export async function generateKnowledgeBookPdf(bookData: KnowledgeBookDocument): Promise<Blob> {
  const doc = generateKnowledgeBookDocument(bookData);
  return await pdf(doc).toBlob();
}

// Helper to create knowledge book from project documents
export function createKnowledgeBookFromProject(
  projectName: string,
  projectId: string,
  documents: DocumentContent[],
  config: Partial<KnowledgeBookConfig>
): KnowledgeBookDocument {
  const fullConfig: KnowledgeBookConfig = {
    title: config.title || `${projectName} Knowledge Book`,
    subtitle: config.subtitle,
    description: config.description,
    author: config.author,
    contributors: config.contributors,
    projectName,
    projectId,
    includeWatermark: config.includeWatermark ?? true,
    watermarkText: config.watermarkText || 'CONFIDENTIAL',
    includeToc: config.includeToc ?? true,
    includePageNumbers: config.includePageNumbers ?? true,
    footerText: config.footerText || `${projectName} | ${new Date().toLocaleDateString()}`,
    metadata: config.metadata,
  };

  const coverConfig: CoverPageConfig = {
    title: fullConfig.title,
    subtitle: fullConfig.subtitle,
    author: fullConfig.author,
    projectName: fullConfig.projectName,
    date: new Date().toLocaleDateString(),
    backgroundColor: '#080D18',
    textColor: '#53D8FB',
  };

  const tocConfig: TableOfContentsConfig = {
    title: 'Table of Contents',
    includePageNumbers: true,
    maxDepth: 2,
    style: 'dots',
  };

  return {
    config: fullConfig,
    documents: documents.map((doc, index) => ({ ...doc, order: index })),
    coverPage: coverConfig,
    toc: tocConfig,
  };
}