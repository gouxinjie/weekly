#!/usr/bin/env bash
# weekly 数据库备份脚本
# 建议加入 crontab：0 3 * * * /var/www/weekly/deploy/backup.sh
#
# 必须在服务运行时用 VACUUM INTO 生成一致性快照，
# 不要直接 cp 数据库文件——WAL 模式下可能拿到不一致的快照。

set -euo pipefail

APP_DIR="/var/www/weekly"
BACKUP_DIR="${APP_DIR}/backup"
DB_FILE="${APP_DIR}/data/weekly.db"
KEEP_DAYS=30

mkdir -p "${BACKUP_DIR}"

TARGET="${BACKUP_DIR}/weekly-$(date +%F).db"

# 当天已有备份时先删除，避免 VACUUM INTO 因目标文件存在而失败
rm -f "${TARGET}"

sqlite3 "${DB_FILE}" "VACUUM INTO '${TARGET}'"
echo "备份完成：${TARGET}"

# 清理超过保留期的备份，防止磁盘被逐步占满
find "${BACKUP_DIR}" -name 'weekly-*.db' -type f -mtime "+${KEEP_DAYS}" -delete
