import os
import argparse
import datetime
import time

def check_recent_updates(root_dir, days, exclude_folders, sort_by):
    # Hitung waktu batas (sekarang - jumlah hari)
    cutoff_time = time.time() - (days * 86400)
    
    print(f"\n[INFO] Mengecek perubahan dalam {days} hari terakhir...")
    print(f"[INFO] Direktori Root: {os.path.abspath(root_dir)}")
    if exclude_folders:
        print(f"[INFO] Exclude Folders: {', '.join(exclude_folders)}")
    print(f"[INFO] Mode Sortir: {sort_by}")

    results = []

    # Walk melalui direktori
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Filter excluded folders
        dirnames[:] = [
            d for d in dirnames 
            if not d.startswith('.') 
            and d != '__pycache__'
            and d != 'node_modules'
            and d not in exclude_folders
        ]
        
        folder_max_mtime = 0
        folder_has_recent_update = False
        latest_filename = ""
        
        # Cek setiap file dalam folder ini
        for filename in filenames:
            if filename.startswith('.'):
                continue
                
            filepath = os.path.join(dirpath, filename)
            try:
                mtime = os.path.getmtime(filepath)
                
                # Simpan waktu modifikasi terbaru di folder ini
                if mtime > folder_max_mtime:
                    folder_max_mtime = mtime
                    latest_filename = filename
                
                # Cek apakah masuk kriteria filter waktu
                if mtime >= cutoff_time:
                    folder_has_recent_update = True
            except OSError:
                continue
        
        # Jika ada file baru di folder ini, simpan ke list results
        if folder_has_recent_update:
            mod_time_str = datetime.datetime.fromtimestamp(folder_max_mtime).strftime('%Y-%m-%d %H:%M:%S')
            
            # Buat path relatif
            rel_path = os.path.relpath(dirpath, root_dir)
            if rel_path == ".":
                rel_path = "(Root Directory)"
            
            # Truncate path untuk display
            display_path = (rel_path[:42] + '..') if len(rel_path) > 42 else rel_path
            
            # Truncate filename jika terlalu panjang
            display_filename = (latest_filename[:27] + '..') if len(latest_filename) > 27 else latest_filename
            
            results.append({
                'path': rel_path,
                'display_path': display_path,
                'filename': latest_filename,
                'display_filename': display_filename,
                'mtime': folder_max_mtime,
                'time_str': mod_time_str
            })

    # Logika Sorting
    if sort_by == 'name':
        results.sort(key=lambda x: x['path'].lower())
    elif sort_by == 'newest':
        results.sort(key=lambda x: x['mtime'], reverse=True)
    elif sort_by == 'oldest':
        results.sort(key=lambda x: x['mtime'])

    # Menampilkan Hasil
    # Format: Path (45 char) | Filename (30 char) | Date (20 char)
    header_line = "-" * 100
    print(header_line)
    print(f"{'Folder':<45} | {'File Terakhir':<30} | {'Waktu Update':<20}")
    print(header_line)

    if not results:
        print(f"Tidak ada file yang berubah dalam {days} hari terakhir.")
    else:
        for item in results:
            print(f"{item['display_path']:<45} | {item['display_filename']:<30} | {item['time_str']:<20}")
            
    print(header_line)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Cek folder yang berubah baru-baru ini.")
    parser.add_argument("--days", type=int, default=7, help="Rentang waktu dalam hari (default: 7)")
    parser.add_argument("--dir", type=str, default=".", help="Direktori target")
    parser.add_argument("--exclude", nargs='*', default=[], help="Exclude folder (pisahkan dengan spasi)")
    parser.add_argument("--sort", choices=['name', 'newest', 'oldest'], default='newest', help="Urutan: name, newest (default), oldest")
    
    args = parser.parse_args()
    
    check_recent_updates(args.dir, args.days, args.exclude, args.sort)