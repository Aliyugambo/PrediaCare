#!/bin/bash

# Carenix Backend Quick Start Script

echo "================================================"
echo "Carenix Clinic - Backend Quick Start"
echo "================================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install from https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js found: $(node -v)"
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed."
    exit 1
fi

echo "✓ npm found: $(npm -v)"
echo ""

# Navigate to backend directory
cd "$(dirname "$0")" || exit

echo "Installing dependencies..."
npm install

echo ""
echo "================================================"
echo "Setup Complete!"
echo "================================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Make sure MySQL is running"
echo ""
echo "2. Edit .env file with your MySQL credentials:"
echo "   nano .env"
echo ""
echo "3. Initialize the database:"
echo "   node init-db.js"
echo ""
echo "4. Start the server:"
echo "   npm start"
echo ""
echo "5. In another terminal, serve your HTML files:"
echo "   cd .."
echo "   python -m http.server 80"
echo ""
echo "6. Open browser:"
echo "   http://localhost/sign-in.html"
echo ""
echo "================================================"
