function sendSuccess(res, data, message, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    error: null
  });
}

function sendError(res, statusCode, message, details) {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    error: details ? { message, details } : { message }
  });
}

module.exports = {
  sendSuccess,
  sendError
};
