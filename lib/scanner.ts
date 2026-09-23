import { logger } from "./logger.ts";
import { Params } from "./params.ts";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

interface ImageFile {
  path: string;
  birthtime: Date;
}

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot).toLowerCase();
}

function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(filename));
}

export async function scanImages(params: Params): Promise<string[]> {
  const { imageFolderPath, maxDepth, maxFiles } = params;
  const images: ImageFile[] = [];

  logger.info(`Scanning for images in: ${imageFolderPath}`);

  // Breadth-first traversal using a queue of [path, depth] pairs
  const queue: Array<{ path: string; depth: number }> = [{ path: imageFolderPath, depth: 0 }];

  while (queue.length > 0 && images.length < maxFiles) {
    const current = queue.shift()!;

    if (current.depth > maxDepth) {
      continue;
    }

    try {
      const entries: Deno.DirEntry[] = [];
      for await (const entry of Deno.readDir(current.path)) {
        entries.push(entry);
      }

      // Collect subdirectories and image files from this folder
      const subdirs: string[] = [];
      const folderImages: ImageFile[] = [];

      for (const entry of entries) {
        const fullPath = `${current.path}/${entry.name}`;

        if (entry.isDirectory) {
          if (current.depth < maxDepth) {
            subdirs.push(fullPath);
          }
        } else if (entry.isFile && isImageFile(entry.name)) {
          try {
            const stat = await Deno.stat(fullPath);
            folderImages.push({
              path: fullPath,
              birthtime: stat.birthtime ?? stat.mtime ?? new Date(0),
            });
          } catch (statError) {
            logger.warn(`Failed to stat file ${fullPath}: ${statError}`);
          }
        }
      }

      // Sort images in this folder by creation date
      folderImages.sort((a, b) => a.birthtime.getTime() - b.birthtime.getTime());

      // Add images to result (respecting maxFiles limit)
      for (const img of folderImages) {
        if (images.length >= maxFiles) break;
        images.push(img);
      }

      // Add subdirectories to queue for BFS
      for (const subdir of subdirs) {
        queue.push({ path: subdir, depth: current.depth + 1 });
      }
    } catch (error) {
      logger.error(`Failed to read directory ${current.path}: ${error}`);
    }
  }

  logger.info(`Found ${images.length} images`);
  return images.map((img) => img.path);
}
