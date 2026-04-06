import React from 'react';
import Head from 'next/head';
import path from 'path';
import fs from 'fs';
import DocViewer from '@/components/DocViewer';
import Link from 'next/link';

export default function DocPage({ content, slug }) {
  const formattedTitle = slug.replace(/_/g, ' ').replace('.md', '');

  return (
    <>
      <Head>
        <title>{formattedTitle} - SnowfigIP Docs</title>
      </Head>
      <div style={{ maxWidth: '900px', margin: '0 auto 20px auto' }}>
        <Link href="/" style={{ color: '#0969da', textDecoration: 'none', fontWeight: 'bold' }}>
          ← Back to Index
        </Link>
      </div>
      <DocViewer content={content} />
    </>
  );
}

export async function getStaticPaths() {
  const docsDirectory = "/Users/ramiz/lks tech/SnowfigIP-BE/SnowfigIP-Documentation";
  const filenames = fs.readdirSync(docsDirectory);

  // Exclude README.md as it's served by index.js
  const paths = filenames
    .filter((name) => name !== 'README.md' && name.endsWith('.md'))
    .map((name) => ({
      params: { slug: name.replace('.md', '') },
    }));

  return { paths, fallback: false };
}

export async function getStaticProps({ params }) {
  const filePath = path.join("/Users/ramiz/lks tech/SnowfigIP-BE/SnowfigIP-Documentation", `${params.slug}.md`);
  const fileContent = fs.readFileSync(filePath, 'utf8');

  return {
    props: {
      content: fileContent,
      slug: params.slug,
    },
  };
}
