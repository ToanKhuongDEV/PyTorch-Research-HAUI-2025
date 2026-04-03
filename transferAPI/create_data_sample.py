# transferAPI/seed_data.py

# Tạo dữ liệu giả cho cơ sở dữ liệu SQLite
import sqlite3
import os
import random
from datetime import datetime, timedelta

DEFECT_TYPES = ["Blowhole", "Break", "Crack", "Fray", "Free", "Uneven"]

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_NAME = os.path.join(BASE_DIR, "defects.db")

def seed_database():
    print(f"--- Đang tạo dữ liệu giả vào {DB_NAME} ---")
    
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    
    # Đảm bảo bảng tồn tại
    c.execute('''CREATE TABLE IF NOT EXISTS inspections
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  timestamp TEXT,
                  status TEXT,
                  defect_type TEXT,
                  confidence REAL,
                  process_time REAL)''')
    
    # Xóa dữ liệu cũ để tránh rác nếu cần (hiện đang comment)
    # c.execute("DELETE FROM inspections")
    
    # Tạo 100 bản ghi
    now = datetime.now()
    
    for i in range(100):
        # Thời gian ngẫu nhiên trong 7 ngày
        random_minutes = random.randint(1, 10080) 
        timestamp = (now - timedelta(minutes=random_minutes)).strftime("%Y-%m-%d %H:%M:%S")
        
        # Chỉ tạo ra dữ liệu OK và NG (Lỗi), tuyệt đối KHÔNG có INVALID
        status = random.choices(["OK", "NG"], weights=[0.4, 0.6])[0]
        
        if status == "NG":
            defect_type = random.choice(DEFECT_TYPES)
            confidence = round(random.uniform(0.80, 0.99), 2)
        else:
            status = "OK"
            defect_type = "None"
            confidence = 1.0
            
        process_time = round(random.uniform(150, 400), 1)
        
        c.execute("INSERT INTO inspections (timestamp, status, defect_type, confidence, process_time) VALUES (?, ?, ?, ?, ?)",
                  (timestamp, status, defect_type, confidence, process_time))
        
    conn.commit()
    conn.close()
    print("✅ Đã thêm 100 bản ghi thành công!")

if __name__ == "__main__":
    seed_database()