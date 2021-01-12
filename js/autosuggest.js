var options = {
    url: "http://127.0.0.1:5500/resources/pharmacy_mapping_data.geojson",

    getValue: "properties",

    template: {
        type: "Feature",
        fields: {
            link: "name_of_pharmacy"
        }
    },

    theme: "plate-dark"
};

$("#name_of_pharmacy").easyAutocomplete(options);