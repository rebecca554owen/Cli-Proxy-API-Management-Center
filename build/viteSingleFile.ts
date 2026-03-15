import type { Plugin, ResolvedConfig } from 'vite';

type OutputAssetLike = {
  fileName: string;
  source: string | Uint8Array;
};

type OutputChunkLike = {
  fileName: string;
  code: string;
};

type BundleLike = Record<string, OutputAssetLike | OutputChunkLike>;

const isHtmlFile = /\.html?$/;
const isCssFile = /\.css$/;
const isJsFile = /\.[mc]?js$/;

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceScript(html: string, fileName: string, code: string) {
  const pattern = new RegExp(
    `<script([^>]*?) src="(?:[^"]*?/)?${escapeRegex(fileName)}"([^>]*)></script>`
  );
  const nextCode = code
    .replace(/"?__VITE_PRELOAD__"?/g, 'void 0')
    .replace(/<(\/script>|!--)/g, '\\x3C$1');
  return html.replace(pattern, (_, beforeSrc, afterSrc) => {
    return `<script${beforeSrc}${afterSrc}>${nextCode.trim()}</script>`;
  });
}

function replaceCss(html: string, fileName: string, source: string) {
  const pattern = new RegExp(
    `<link([^>]*?) href="(?:[^"]*?/)?${escapeRegex(fileName)}"([^>]*)>`
  );
  return html.replace(pattern, (_, beforeHref, afterHref) => {
    return `<style${beforeHref}${afterHref}>${source.replace('@charset "UTF-8";', '').trim()}</style>`;
  });
}

function asString(source: string | Uint8Array) {
  return typeof source === 'string' ? source : Buffer.from(source).toString('utf8');
}

export function viteSingleFile(): Plugin {
  let config: ResolvedConfig;

  return {
    name: 'local:singlefile',
    enforce: 'post',
    config(currentConfig) {
      currentConfig.base = './';
      currentConfig.build ??= {};
      currentConfig.build.assetsInlineLimit = () => true;
      currentConfig.build.chunkSizeWarningLimit = 100000000;
      currentConfig.build.cssCodeSplit = false;
      currentConfig.build.assetsDir = '';
      currentConfig.build.rollupOptions ??= {};
      currentConfig.build.rollupOptions.output ??= {};
      if (Array.isArray(currentConfig.build.rollupOptions.output)) {
        currentConfig.build.rollupOptions.output = currentConfig.build.rollupOptions.output.map(
          (output) => ({
            ...output,
            manualChunks: undefined,
            codeSplitting: false
          })
        );
        return;
      }
      currentConfig.build.rollupOptions.output = {
        ...currentConfig.build.rollupOptions.output,
        manualChunks: undefined,
        codeSplitting: false
      };
    },
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    generateBundle(_, bundle) {
      if (config.build.ssr) {
        return;
      }

      const files = {
        html: [] as string[],
        css: [] as string[],
        js: [] as string[],
        other: [] as string[]
      };

      Object.keys(bundle).forEach((fileName) => {
        if (isHtmlFile.test(fileName)) {
          files.html.push(fileName);
          return;
        }
        if (isCssFile.test(fileName)) {
          files.css.push(fileName);
          return;
        }
        if (isJsFile.test(fileName)) {
          files.js.push(fileName);
          return;
        }
        files.other.push(fileName);
      });

      const typedBundle = bundle as BundleLike;
      const bundlesToDelete = new Set<string>();

      files.html.forEach((htmlFileName) => {
        const htmlAsset = typedBundle[htmlFileName];
        if (!htmlAsset || !('source' in htmlAsset)) {
          return;
        }

        let html = asString(htmlAsset.source);

        files.js.forEach((jsFileName) => {
          const jsChunk = typedBundle[jsFileName];
          if (!jsChunk || !('code' in jsChunk)) {
            return;
          }
          this.info(`Inlining: ${jsFileName}`);
          html = replaceScript(html, jsChunk.fileName, jsChunk.code);
          bundlesToDelete.add(jsFileName);
        });

        files.css.forEach((cssFileName) => {
          const cssAsset = typedBundle[cssFileName];
          if (!cssAsset || !('source' in cssAsset)) {
            return;
          }
          this.info(`Inlining: ${cssFileName}`);
          html = replaceCss(html, cssAsset.fileName, asString(cssAsset.source));
          bundlesToDelete.add(cssFileName);
        });

        htmlAsset.source = html;
      });

      bundlesToDelete.forEach((fileName) => {
        delete typedBundle[fileName];
      });

      files.other.forEach((fileName) => {
        this.info(`NOTE: asset not inlined: ${fileName}`);
      });
    }
  };
}
