from datetime import datetime, timedelta


def parse_timespan(span: str) -> timedelta:
    """
    Parse a string representing a time span and return a timedelta object.

    Args:
        span (str): A string representing the time span, e.g., "1d", "2h", "30m", "120s", "1500ms".

    Returns:
        timedelta: A timedelta object representing the specified time span.

    Raises:
        ValueError: If the input string is not in a valid format.
    """
    try:
        value, unit = span[:-1], span[-1]
        value = int(value)
        if unit.lower() == "d":
            return timedelta(days=value)
        elif unit.lower() == "h":
            return timedelta(hours=value)
        elif unit == "m":
            return timedelta(minutes=value)
        elif unit.lower() == "s":
            return timedelta(seconds=value)
        elif unit.lower() == "ms":
            return timedelta(milliseconds=value)
        elif unit == "M":
            return timedelta(days=value * 30)
        elif unit.lower() == "y":
            return timedelta(days=value * 365)
        else:
            raise ValueError("Invalid time span format")
    except ValueError:
        raise ValueError("Invalid time span format")
