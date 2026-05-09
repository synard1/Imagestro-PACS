### **Dokumentasi Fitur: Role-Based Access Control (RBAC)**

Sistem ini sekarang dilengkapi dengan API manajemen Role-Based Access Control (RBAC) yang komprehensif dan granular. Fitur ini memungkinkan administrator untuk mendefinisikan `Roles` (Peran), `Permissions` (Izin), dan menetapkan hubungan di antara keduanya untuk mengontrol akses pengguna ke berbagai sumber daya sistem secara aman dan efisien.

Semua endpoint manajemen RBAC ini memerlukan hak akses level administrator (`system:admin` atau `*`).

#### **1. Konsep Dasar**

*   **Permissions (Izin)**: Izin adalah hak akses tunggal untuk melakukan tindakan tertentu, seperti `user:create` (membuat pengguna) atau `worklist:read` (membaca daftar kerja). Izin bersifat atomik dan menjadi dasar dari sistem RBAC.
*   **Roles (Peran)**: Peran adalah kumpulan dari satu atau lebih izin. Peran mendefinisikan fungsi pekerjaan atau level akses dalam sistem, misalnya `TECHNICIAN` atau `DOCTOR`. Pengguna dapat diberi satu atau lebih peran.
*   **Penugasan (Assignments)**: Ini adalah proses menghubungkan izin ke peran dan menghubungkan peran ke pengguna.
    *   **Role-Permission**: Menetapkan izin mana saja yang dimiliki oleh sebuah peran.
    *   **User-Role**: Menetapkan peran mana saja yang dimiliki oleh seorang pengguna.

#### **Protected & Visibility Flags (DB-driven)**

Semua `roles` dan `permissions` kini memiliki dua atribut tambahan pada tabel database:

*   **`protected` (boolean)**: Tidak bisa diubah/dihapus oleh admin tenant biasa (hanya superadmin/developer). Gunakan untuk role/permission inti.
*   **`hidden_from_tenant_admin` (boolean)**: Tidak ditampilkan ke admin tenant biasa (hanya terlihat oleh superadmin/developer). Gunakan untuk item sangat sensitif seperti `SUPERADMIN`, `DEVELOPER`, `*`, dsb.

**Aturan akses ringkas**

*   **Superadmin/Developer** (`*`, `rbac:manage`, atau role SUPERADMIN/DEVELOPER): boleh melihat & mengelola semua.
*   **Admin tenant** (role `ADMIN`, punya `rbac:view` + `rbac:custom-manage`):
    *   Melihat hanya role/permission dengan `hidden_from_tenant_admin = false`.
    *   Mengubah/menghapus hanya role/permission yang **tidak** `protected` **dan** tidak `hidden_from_tenant_admin`.
    *   Boleh menambahkan permission protected yang terlihat ke role (attachment), tapi tidak boleh membuat/mengubah/menghapusnya.

**Respons API** untuk role/permission akan menyertakan field `protected` dan `hidden_from_tenant_admin` agar UI bisa:

* Menyembunyikan baris jika `hidden_from_tenant_admin = true` untuk admin biasa.
* Menonaktifkan tombol edit/hapus jika `protected = true`.

#### **2. API Endpoints Manajemen RBAC**

Endpoint-endpoint berikut tersedia melalui **API Gateway** pada path `/auth`.

##### **A. Manajemen Permissions**

Endpoint untuk mengelola (CRUD) `Permissions` yang tersedia di sistem.

*   **`GET /auth/permissions`**
    *   **Tujuan**: Mendapatkan daftar semua `Permissions` yang tersedia.
    *   **Respon Sukses (200 OK)**:
        ```json
        {
          "status": "success",
          "permissions": [
            {
              "id": "uuid-permission-1",
              "name": "user:read",
              "description": "Membaca informasi pengguna",
              "category": "user"
            }
          ]
        }
        ```

*   **`POST /auth/permissions`**
    *   **Tujuan**: Membuat `Permission` baru.
    *   **Body Permintaan (JSON)**:
        ```json
        {
          "name": "billing:read",
          "description": "Izin untuk melihat data tagihan",
          "category": "billing"
        }
        ```
    *   **Respon Sukses (201 Created)**: Mengembalikan detail `Permission` yang baru dibuat.

*   **`GET /auth/permissions/{permission_id}`**
    *   **Tujuan**: Mendapatkan detail satu `Permission` berdasarkan ID-nya.

*   **`PUT /auth/permissions/{permission_id}`**
    *   **Tujuan**: Memperbarui detail `Permission` (misalnya, deskripsi atau kategori).
    *   **Body Permintaan (JSON)**:
        ```json
        {
          "description": "Deskripsi baru yang lebih detail"
        }
        ```

*   **`DELETE /auth/permissions/{permission_id}`**
    *   **Tujuan**: Menghapus `Permission` dari sistem.

##### **B. Manajemen Roles**

Endpoint untuk mengelola (CRUD) `Roles` yang ada di sistem.

*   **`GET /auth/roles`**
    *   **Tujuan**: Mendapatkan daftar semua `Roles` yang tersedia.

*   **`POST /auth/roles`**
    *   **Tujuan**: Membuat `Role` baru.
    *   **Body Permintaan (JSON)**:
        ```json
        {
          "name": "FINANCE_STAFF",
          "description": "Peran untuk staf keuangan"
        }
        ```
    *   **Respon Sukses (201 Created)**: Mengembalikan detail `Role` yang baru dibuat.

*   **`GET /auth/roles/{role_id}`**
    *   **Tujuan**: Mendapatkan detail satu `Role` berdasarkan ID-nya.

*   **`PUT /auth/roles/{role_id}`**
    *   **Tujuan**: Memperbarui detail `Role` (nama atau deskripsi).

*   **`DELETE /auth/roles/{role_id}`**
    *   **Tujuan**: Menghapus `Role` dari sistem.

##### **C. Manajemen Penugasan (Assignments)**

Endpoint untuk menghubungkan `Roles`, `Permissions`, dan `Users`.

*   **`GET /auth/roles/{role_id}/permissions`**
    *   **Tujuan**: Melihat semua `Permissions` yang telah ditugaskan ke sebuah `Role`.

*   **`POST /auth/roles/{role_id}/permissions`**
    *   **Tujuan**: Menugaskan sebuah `Permission` ke sebuah `Role`.
    *   **Body Permintaan (JSON)**:
        ```json
        {
          "permission_id": "uuid-permission-yang-akan-ditugaskan"
        }
        ```

*   **`DELETE /auth/roles/{role_id}/permissions/{permission_id}`**
    *   **Tujuan**: Mencabut `Permission` dari sebuah `Role`.

*   **`POST /auth/users/{user_id}/roles`**
    *   **Tujuan**: Menugaskan `Role` ke seorang `User`.
    *   **Body Permintaan (JSON)**:
        ```json
        {
          "role_id": "uuid-role-yang-akan-ditugaskan"
        }
        ```

*   **`DELETE /auth/users/{user_id}/roles/{role_id}`**
    *   **Tujuan**: Mencabut `Role` dari seorang `User`.

*   **`GET /auth/users/{user_id}/permissions`**
    *   **Tujuan**: Melihat semua `Permissions` yang telah ditugaskan secara langsung ke seorang `User`.
    *   **Izin yang Dibutuhkan**: `user:read`, `user:manage`, atau `*` (wildcard).

*   **`POST /auth/users/{user_id}/permissions`**
    *   **Tujuan**: Menugaskan `Permission` secara langsung ke seorang `User`.
    *   **Izin yang Dibutuhkan**: `user:manage` atau `*` (wildcard).
    *   **Body Permintaan (JSON)**:
        ```json
        {
          "permission_id": "uuid-permission-yang-akan-ditugaskan"
        }
        ```

*   **`DELETE /auth/users/{user_id}/permissions/{permission_id}`**
    *   **Tujuan**: Mencabut `Permission` yang ditugaskan secara langsung dari seorang `User`.
    *   **Izin yang Dibutuhkan**: `user:manage` atau `*` (wildcard).

##### **D. Manajemen Cache**

Untuk optimasi, izin pengguna disimpan dalam cache. Endpoint ini digunakan untuk mengelola cache tersebut.

*   **`POST /auth/cache/clear`**
    *   **Tujuan**: Menghapus cache izin. Ini **wajib dipanggil** setelah memodifikasi izin sebuah peran (`Role`) agar perubahan segera efektif untuk semua pengguna.
    *   **Body Permintaan (Opsional)**: Jika body kosong, seluruh cache akan dihapus. Jika `user_id` diberikan, hanya cache untuk pengguna tersebut yang akan dihapus.
        ```json
        {
          "user_id": "uuid-user-spesifik"
        }
        ```

*   **`GET /auth/cache/stats`**
    *   **Tujuan**: Mendapatkan statistik penggunaan cache (untuk keperluan debugging dan tuning).

#### **3. Contoh Penggunaan (Test Script)**

Sebuah skrip pengujian end-to-end telah dibuat untuk memvalidasi dan mendemonstrasikan penggunaan seluruh API RBAC ini. Skrip ini melakukan siklus lengkap: login, membuat permission, membuat role, menugaskan permission ke role, memverifikasi, mencabut, dan membersihkan.

Anda dapat menjalankan skrip ini untuk melihat contoh nyata dari alur kerja API:
```bash
/home/apps/fullstack-orthanc-dicom/scripts/test_rbac_api.sh
```

### **Panduan Implementasi Frontend/UI**

- Gunakan field `protected` untuk menonaktifkan aksi edit/hapus pada role/permission.
- Sembunyikan item dengan `hidden_from_tenant_admin = true` jika user **bukan** superadmin/developer.
- Saat menambah role ke user atau permission ke role/user:
  - Tampilkan hanya item yang tidak hidden untuk user tersebut.
  - Jika API merespons 403, sampaikan pesan “Role/permission dilindungi, hubungi superadmin/developer”.
- Endpoint sudah visibility-aware: `/auth/roles`, `/auth/roles/:role`, `/auth/roles/:role/users`, `/auth/permissions`, `/auth/roles/:roleId/permissions`, `/auth/users/:userId/permissions`, `/auth/users/:userId/roles`.
- Periksa `status` dan `message` pada respons untuk memandu UX (mis. disable tombol, tampilkan tooltip).
