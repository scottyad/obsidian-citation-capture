"""Private local Anthropic usage ledger. Never stores prompts, keys, or user identifiers."""
import json
import sqlite3
from pathlib import Path
from datetime import datetime, timezone, timedelta

DB = Path(__file__).resolve().parent / 'data' / 'anthropic_usage.sqlite3'

def connect():
    DB.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB, timeout=10)
    c.execute('CREATE TABLE IF NOT EXISTS calls (at TEXT, tool TEXT, credential_type TEXT, model TEXT, outcome TEXT, input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER, cache_write_tokens INTEGER)')
    return c

def record(tool, credential_type, model, response=None):
    usage = getattr(response, 'usage', None)
    try:
        with connect() as c:
            c.execute('INSERT INTO calls VALUES (?,?,?,?,?,?,?,?,?)', (
                datetime.now(timezone.utc).isoformat(), tool, credential_type,
                getattr(response, 'model', model), 'success' if response is not None else 'error',
                *[int(getattr(usage, k, 0) or 0) for k in ('input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens')]))
    except Exception as e:
        print('API usage ledger unavailable: %s' % type(e).__name__)

class Messages:
    def __init__(self, wrapped, tool, credential_type):
        self.wrapped, self.tool, self.credential_type = wrapped, tool, credential_type
    def create(self, **kwargs):
        try:
            response = self.wrapped.create(**kwargs)
        except Exception:
            record(self.tool, self.credential_type, kwargs.get('model', 'unknown'))
            raise
        record(self.tool, self.credential_type, kwargs.get('model', 'unknown'), response)
        return response

class TrackedClient:
    def __init__(self, client, tool, credential_type='hosted'):
        self.messages = Messages(client.messages, tool, credential_type)

def report(days=30):
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    with connect() as c:
        rows = c.execute('SELECT tool,credential_type,COUNT(*),SUM(outcome="success"),SUM(outcome="error"),SUM(input_tokens),SUM(output_tokens),SUM(cache_read_tokens),SUM(cache_write_tokens),MIN(at),MAX(at) FROM calls WHERE at >= ? GROUP BY tool,credential_type', (since,)).fetchall()
    fields = ['tool','credential_type','requests','successes','errors','input_tokens','output_tokens','cache_read_tokens','cache_write_tokens','first_record','last_record']
    return {'since_utc': since, 'through_utc': datetime.now(timezone.utc).isoformat(), 'groups': [dict(zip(fields, r)) for r in rows]}

if __name__ == '__main__':
    print(json.dumps(report(), indent=2))
