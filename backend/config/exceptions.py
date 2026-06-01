from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None:
        response.data = {
            'success': False,
            'message': _get_message(response.data),
            'errors': response.data,
        }
    return response


def _get_message(data):
    if isinstance(data, dict):
        if 'detail' in data:
            return str(data['detail'])
        first = next(iter(data), None)
        if first:
            val = data[first]
            return str(val[0]) if isinstance(val, list) else str(val)
    if isinstance(data, list) and data:
        return str(data[0])
    return 'An error occurred.'


def success_response(data=None, message='Success', status_code=status.HTTP_200_OK):
    body = {'success': True, 'message': message}
    if data is not None:
        body['data'] = data
    return Response(body, status=status_code)