import React from 'react';
import Head from 'next/head';
import path from 'path';
import fs from 'fs';
import DocViewer from '@/components/DocViewer';

export default function DocsIndex({ content }) {
  return (
    <>
      <Head>
        <title>SnowfigIP Ecosystem Documentation</title>
      </Head>
      <DocViewer content={content} />
    </>
  );
}

export async function getStaticProps() {
  const filePath = "/Users/ramiz/lks tech/SnowfigIP-BE/SnowfigIP-Documentation/README.md";
  const fileContent = fs.readFileSync(filePath, 'utf8');

  return {
    props: {
      content: fileContent,
    },
  };
}
