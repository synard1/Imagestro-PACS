# DESIGN

## Visual Direction
- Theme: dark-neutral untuk penggunaan di ruang kontrol radiologi dengan pencahayaan redup saat shift malam.
- Color strategy: restrained dengan satu aksen status kritikal, netral dominan tetap terbaca lama.

## Color Tokens (OKLCH)
- Surface base: oklch(0.18 0.01 250)
- Surface raised: oklch(0.24 0.012 250)
- Border subtle: oklch(0.34 0.01 250)
- Text primary: oklch(0.92 0.01 250)
- Text muted: oklch(0.74 0.01 250)
- Accent primary: oklch(0.66 0.13 235)
- Success: oklch(0.72 0.12 155)
- Warning: oklch(0.78 0.14 85)
- Danger: oklch(0.64 0.18 28)

## Typography
- Font stack: Inter, system-ui, sans-serif.
- Body line length target: 65-75ch.
- Scale ratio minimal: 1.25 antar level hierarchy utama.

## Layout & Components
- Gunakan panel fungsional, bukan grid kartu seragam.
- Jaga ritme spacing bertingkat (8, 12, 16, 24, 32).
- Workflow canvas jadi pusat, detail status sebagai side panel adaptif.

## Motion
- Hindari animasi properti layout.
- Gunakan transform + opacity dengan ease-out-quint.
- Animasi dipakai untuk menunjukkan progres alur, bukan dekorasi.

## Accessibility
- Kontras tinggi untuk teks status operasional.
- Fokus keyboard terlihat jelas pada node interaktif.
- Status tidak boleh hanya dibedakan dengan warna, sertakan label/ikon.
