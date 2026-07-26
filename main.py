import os
import sys
import argparse 
from dotenv import load_dotenv

# Load environment keys from .env file
load_dotenv()

import rag

def cmd_index(args):
    print(f"Indexing documents in '{args.docs}'...")
    try:
        rag.build_index(args.docs)
        print("Indexing completed successfully!")
    except Exception as e:
        print(f"Error during indexing: {e}", file=sys.stderr)

def cmd_chat(args):
    try:
        store = rag.load_index() 
    except Exception as e:
        print(f"Error loading index: {e}\nPlease run 'python main.py index' first.", file=sys.stderr)
        return

    print("--- Notes Chat Session Started (Type 'exit' or 'quit' to exit) ---")
    try:
        while True:
            q = input("you > ").strip()
            if not q:
                continue
            if q.lower() in ("exit", "quit"):
                print("Goodbye!")
                break
                
            docs, token_gen = rag.answer(store, q)  
            print('bot > ', end="", flush=True)
            for t in token_gen:
                print(t, end="", flush=True)  
            print("\n")
    except KeyboardInterrupt:
        print("\nGoodbye!")

def main():
    p = argparse.ArgumentParser(description="Chatwithfile CLI Dashboard")
    sub = p.add_subparsers(dest="command", required=True)
    
    # Index Subcommand
    pi = sub.add_parser("index", help="build vector index from documents directory")
    pi.add_argument("--docs", default="docs", help="Directory containing source documents")
    pi.set_defaults(func=cmd_index)  
    
    # Chat Subcommand
    pc = sub.add_parser("chat", help="Start interactive CLI chat session")
    pc.set_defaults(func=cmd_chat) 
    
    args = p.parse_args()
    args.func(args) 

if __name__ == "__main__":
    main()
