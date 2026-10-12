# Hệ thống Quản lý Thư viện

Ứng dụng CRUD quản lý sách và độc giả, viết bằng Node.js/Express, lưu dữ liệu trên PostgreSQL và triển khai bằng Docker Compose. Nginx làm reverse proxy HTTPS với chứng chỉ tự ký; pgAdmin dùng để quản trị cơ sở dữ liệu.

## Cấu trúc

```text
.
|-- app/
|   |-- public/styles.css
|   |-- src/server.js
|   |-- views/index.ejs
|   |-- Dockerfile
|   `-- package.json
|-- nginx/
|   |-- Dockerfile
|   `-- default.conf
|-- postgres/init.sql
|-- docker-compose.yml
|-- .env.example
`-- .gitignore
```

## Yêu cầu

- Docker Desktop hoặc Docker Engine kèm Docker Compose v2.
- Cổng `443` và `5050` không được ứng dụng khác sử dụng.

## Chạy ứng dụng

1. Tạo file cấu hình môi trường từ mẫu:

	```powershell
	Copy-Item .env.example .env
	```

	Trên macOS/Linux dùng `cp .env.example .env`. Mở `.env` và thay các mật khẩu mẫu trước khi chạy.

2. Build và khởi chạy các dịch vụ:

	```sh
	docker compose up --build -d
	```

3. Truy cập:

	- Ứng dụng: <https://localhost> (trình duyệt sẽ cảnh báo vì chứng chỉ tự ký; chỉ chấp nhận cảnh báo trong môi trường phát triển này).
	- pgAdmin: <http://localhost:5050>, đăng nhập bằng `PGADMIN_DEFAULT_EMAIL` và `PGADMIN_DEFAULT_PASSWORD` trong `.env`.

Trong pgAdmin, đăng ký server với host `postgres`, port `5432`, database `library`, username/password theo `POSTGRES_USER` và `POSTGRES_PASSWORD` trong `.env`. Không dùng `localhost` làm host database bên trong container.

## CRUD

Trang chính có biểu mẫu tạo sách/độc giả, biểu mẫu cập nhật ngay trên từng dòng và nút xóa. Các trường dữ liệu được truy vấn bằng prepared statements; nội dung hiển thị được EJS escape mặc định.

## Lệnh hữu ích

```sh
docker compose ps
docker compose logs -f web nginx postgres pgadmin
docker compose down
```

`docker compose down` giữ dữ liệu trong volume. Để xóa cả dữ liệu PostgreSQL và cấu hình pgAdmin, dùng `docker compose down -v` (thao tác này xóa dữ liệu đã lưu).

## Mạng và hardening

- `frontend-network`: chỉ Nginx và ứng dụng web tham gia.
- `backend-network` (`internal: true`): ứng dụng web, PostgreSQL và pgAdmin; Nginx không truy cập trực tiếp database.
- PostgreSQL không publish cổng ra host. pgAdmin được publish tại `5050` để tiện quản trị.
- Container web chạy với user không phải root `appuser`; filesystem ứng dụng ở chế độ chỉ đọc, ngoại trừ `/tmp`.
- Nginx publish HTTPS `443`, chuyển HTTP `80` sang HTTPS, thêm `X-Frame-Options`, `X-Content-Type-Options` và Content Security Policy. Khi container Nginx khởi chạy, nó tự tạo chứng chỉ TLS tự ký `cert.pem` và `key.pem` bên trong container nếu chưa có; không cần cài/chạy OpenSSL trên máy host.

Schema được tạo tự động ở lần khởi tạo PostgreSQL đầu tiên. Nếu đã có volume dữ liệu cũ, script `postgres/init.sql` không chạy lại; để khởi tạo lại từ đầu, xóa volume bằng `docker compose down -v`.
