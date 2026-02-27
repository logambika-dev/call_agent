from enum import Enum

class ErrorResponse(Enum):
    missing = "This field is required"
    string_too_long = "This field is too long"
    string_pattern_mismatch = "This field contains invalid characters"
    string_too_short = "This field is too short"