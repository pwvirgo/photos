#!/usr/bin/env python3
import csv
import hashlib
import os
import sys

def get_md5(file_path):
    if not os.path.exists(file_path):
        return ""
    hash_md5 = hashlib.md5()
    try:
        # Using a 64KB buffer for better performance on larger media files
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()
    except Exception:
        return "ERROR"

def main():
    # Read from standard input
    reader = csv.DictReader(sys.stdin)
    
    if not reader.fieldnames:
        return

    # Prepare new fieldnames:
    # Remove 'SourceFile', add 'Directory', 'Filename', and 'MD5'.
    # FileModifyDate is also dropped here -- it's only a fallback input for
    # CreateDate (see below), not one of the fotos table columns, so it
    # must not appear in the output CSV or it'll shift every column after
    # it out of position for insert_files.sql's positional c1..c12 mapping.
    new_fields = ['path', 'filename'] + [
        f for f in reader.fieldnames if f not in ('SourceFile', 'FileModifyDate')
    ]
    if 'MD5' not in new_fields:
        new_fields.append('MD5')

    # Write to standard output
    writer = csv.DictWriter(sys.stdout, fieldnames=new_fields)
    writer.writeheader()
    once = False

    row_count = 0
    for row in reader:
        original_path = row.get('SourceFile', '')
        if not once:
            sys.stderr.write(f"Processing: {original_path} and then all the rest\n")
        once = True

        if original_path:
            #sys.stderr.write(f"Processing: {original_path}\n")
            
            # Split path into directory and filename
            directory, filename = os.path.split(original_path)
            
            # Populate new columns
            row['path'] = directory
            row['filename'] = filename
            row['MD5'] = get_md5(original_path)

            # dt_created (CreateDate) is EXIF metadata -- some files (e.g.
            # Photo Booth captures) have no EXIF at all, so it comes back
            # as "-" (exiftool's -f placeholder for a missing tag). Fall
            # back to the file's own last-modified timestamp in that case,
            # so dt_created is a real date whenever the file itself has
            # one, even with zero EXIF. dt_taken (DateTimeOriginal) is
            # left alone -- it's fine for it to stay unknown for scans/
            # screenshots that were never "taken" by a camera.
            if row.get('CreateDate') in ('-', '', None):
                row['CreateDate'] = row.get('FileModifyDate', '-')

            # Remove the old combined column and the fallback-only column
            # before writing
            del row['SourceFile']
            del row['FileModifyDate']

            writer.writerow(row)
            row_count += 1
    sys.stderr.write(f"Wrote {row_count} lines\n")    

if __name__ == "__main__":
    main()
