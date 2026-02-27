import json
from pprint import pprint
from lang.main import lang as localize


def pydantic_to_form_error(json_data, lang="en"):
    lang = lang or "en"
    if isinstance(json_data, str):
        json_data = json.loads(json_data)

    error = {}
    for item in json_data:
        loc = item.get("loc")
        msg = item.get("msg")
        type = item.get("type")

        for l in loc:
            value = getattr(localize[lang], type, None)
            if value:
                error[l] = localize[lang][type].value
            else:
                error[l] = msg

    return error
