from typing import Optional

def process_transcript(transcript: str) -> dict:
    """Process and analyze call transcript"""
    return {
        "word_count": len(transcript.split()),
        "processed": True
    }

def extract_sentiment(transcript: str) -> str:
    """Extract sentiment from transcript"""
    # TODO: Implement sentiment analysis
    return "neutral"
