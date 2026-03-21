# Tải dataset về lưu vào thư mục chứa file backend.py
- link dataset: https://www.kaggle.com/datasets/sohamgurav18/plantdiseasesagronexis:
giải nén và để trong thư chứa file backend.py

# plant-disease-demo-web/PlantDiseases
# plant-disease-demo-web/backend.py

# Chạy back end:
- Cài đặt các thư viện cần hoặc cài vào môi trường ảo python
pip install -r requirements.txt
- chạy api:
python -m uvicorn backend:app --reload --port 8000

# Chạy front end:
- Truy cập vào thư mục chứa source code web:
cd plant-disease-ui
- Cài đặt các thư viện cần thiết(cài đặt nodeJS trước chạy lệnh này):
npm i
- Chạy web và kiểm thử:
npm run dev
