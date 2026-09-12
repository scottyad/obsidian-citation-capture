#!/bin/bash
# Obsidian Citation Capture — Local License Server Startup Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check for virtual environment
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate virtual environment
source .venv/bin/activate

# Install/update dependencies
echo "Installing dependencies..."
pip install -q -r requirements.txt

# Check for .env file
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found! Copying from .env.example..."
    cp .env.example .env
    echo "📝 Please edit .env and add your Stripe/Anthropic API keys before running again."
    exit 1
fi

# Load environment variables
export $(grep -v '^#' .env | xargs)

# Create data directory
mkdir -p data

echo "♜ Starting Citation Capture License Server..."
echo "   Port: ${PORT:-8000}"
echo "   Debug: ${DEBUG:-false}"
echo "   Stripe: $([ -n "$STRIPE_SECRET_KEY" ] && echo 'enabled' || echo 'disabled (demo mode)')"
echo "   Cloud AI: $([ -n "$ANTHROPIC_API_KEY" ] && echo 'enabled' || echo 'disabled')"
echo ""
echo "   Dashboard: http://localhost:${PORT:-8000}/dashboard"
echo "   API Docs: http://localhost:${PORT:-8000}/docs"
echo ""

# Run the server
exec uvicorn server:app \
    --host "${HOST:-0.0.0.0}" \
    --port "${PORT:-8000}" \
    --reload \
    --log-level info
