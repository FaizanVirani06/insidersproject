.PHONY: init api worker frontend

init:
	python scripts/init_db.py

api:
	python scripts/run_api.py

worker:
	python scripts/run_worker.py

frontend:
	cd frontend && npm install && npm run dev
