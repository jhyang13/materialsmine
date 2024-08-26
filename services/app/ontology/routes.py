from flask import Blueprint, jsonify,  Response, current_app as app
import json
import datetime
from app.utils.util import token_required, request_logger, log_errors
from app.ontology.github_flow import get_commit_dates, download_file
from app.ontology.helper import details_from_turtle
from app.ontology.cache_service import check_cache, save_to_cache

materialsmine = Blueprint("materialsmine", __name__, url_prefix="/materialsmine")

@materialsmine.route('/extract/', methods=['GET'])
@log_errors
@request_logger
@token_required
def get_data_from_file(request_id):
    try:
        start_time = datetime.datetime.now()

        # Check if data is available in cache
        cached_data = check_cache(app)
        if cached_data:
            # If cached data is found, return it to the frontend
            app.logger.info("Returning cached data.")
            response = create_response(request_id, cached_data, start_time)
            return response
        
        # If cache is not found or empty, proceed with the existing logic
        if download_file(app):
            submission_details = get_commit_dates(app)
            metrics, ontology_info, turtle_data, properties = details_from_turtle(app)
        
            # Constructing the data dictionary
            data = construct_data_dictionary(metrics, ontology_info, submission_details, turtle_data, properties)

            # Save the constructed data to cache
            save_to_cache(app, data)

            response = create_response(request_id, data, start_time)

            return response
        else:
            app.logger.error("Failed to download file from GitHub.")
            return jsonify({'message': "Failed to download file from GitHub"}), 400

    except ValueError as ve:
        app.logger.error(f"ValueError: {str(ve)}", exc_info=True)
        return jsonify({'message': str(ve)}), 400
    except Exception as e:
        app.logger.error(f"Internal Server Error: {str(e)}", exc_info=True)
        return jsonify({'message': "Internal Server error"}), 500
    

def create_response(request_id, data, start_time):
    """Helper function to create a Flask response with headers."""
    json_data = json.dumps(data, indent=4)
    
    response = Response(json_data, content_type='application/json; charset=utf-8', status=200)
    
    end_time = datetime.datetime.now()
    latency = f"{(end_time - start_time).total_seconds()} seconds"
    
    response.headers['startTime'] = start_time
    response.headers['endTime'] = end_time
    response.headers['latency'] = latency
    response.headers['responseId'] = request_id
    return response

def construct_data_dictionary(metrics, ontology_info, submission_details, turtle_data, properties):
    """Helper function to construct the data dictionary."""
    return {
        "details": {
            "Acronyms": "MATERIALSMINE",
            "Visibility": "Public",
            "Description": ontology_info[1],
            "Status": "Alpha",
            "Format": ontology_info[0],
            "Contact": "Marc Palmeri, Ph.D., marc.j.palmeri@duke.edu",
            "Categories": "Chemical, Development, Physicochemical",
        },
        "metrics": metrics,
        "data": turtle_data,
        "submissions": submission_details,
        "properties": properties
    }