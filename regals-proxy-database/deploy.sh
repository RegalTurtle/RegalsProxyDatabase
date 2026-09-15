set -e

git pull
npm install
npm run build
pm2 restart regals-proxy-database --update-env

echo "Deployment complete!"
