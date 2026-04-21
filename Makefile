dev:
	npm run dev

test:
	npm test

build:
	docker build -t csv-to-api .

docker:
	docker run --rm -p 3000:3000 csv-to-api

lint:
	node -e "require('./src/app')"
